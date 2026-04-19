"""Crustdata enrichment pipeline (Recipe D from the API docs).

Combines:
  /company/identify | /company/search   ->  target companies
  /person/search                         ->  candidate decision-makers
  /person/enrich   (batched up to 25)    ->  full profiles + contact
  /company/enrich  (news/hiring/funding) ->  per-company signal context
  llm.generate_briefing                  ->  painPoint + talkingPoints

NOTE on filter schema (verified empirically against the live API — the public
docs are partly wrong):

- Leaf condition: ``{"field": ..., "type": <operator>, "value": ...}``.
  Operator goes in ``type`` (not ``op``).
- Group: ``{"op": "and"|"or", "conditions": [...]}``. ``op`` is reserved for
  groups; leaves never use it.
- Sort entries are inconsistent across endpoints:
    /company/search -> {"column": ..., "order": ...}
    /person/search  -> {"field":  ..., "order": ...}
- Country filter for company search lives at ``locations.country`` (ISO3),
  not ``locations.hq_country`` as the docs claim.
- Two ``(.)`` regex conditions on the same person field rarely match. Use
  ``current.seniority_level`` (enum) + a single ``current.title`` regex
  instead.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from crustdata import CrustdataClient, CrustdataError
from llm import generate_briefing

log = logging.getLogger("pipeline")

MAX_COMPANIES = 8
MAX_PERSONS_PER_COMPANY = 4
MAX_PERSON_SEARCH = 15
MAX_RESULT_PROSPECTS = 5
PERSON_FIELDS = [
    "basic_profile",
    "experience",
    "contact",
    "professional_network",
]
COMPANY_ENRICH_FIELDS = ["basic_info", "news", "hiring", "funding"]


# ---------------------------------------------------------------------------
# Filter -> Crustdata request translation
# ---------------------------------------------------------------------------


def _and_group(conditions: list[dict[str, Any]]) -> dict[str, Any]:
    """Always wrap conditions in an "and" group — Crustdata rejects bare leaves."""
    return {"op": "and", "conditions": conditions}


def _or_group(conditions: list[dict[str, Any]]) -> dict[str, Any]:
    return {"op": "or", "conditions": conditions}


def _countries_iso3(filters: dict[str, Any]) -> list[str]:
    multi = filters.get("countries_iso3") or []
    if isinstance(multi, list):
        return [c for c in multi if isinstance(c, str) and c]
    return []


def _company_search_filters(filters: dict[str, Any]) -> dict[str, Any]:
    """Build a /company/search filter clause from our parsed ICP filters."""
    conditions: list[dict[str, Any]] = []

    industries = filters.get("industries") or []
    if industries:
        conditions.append(
            {"field": "basic_info.industries", "type": "in", "value": industries}
        )

    countries = _countries_iso3(filters)
    if countries:
        # `locations.country` is the *real* ISO3 country filter for company
        # search. (Docs list `locations.hq_country` but the live API rejects
        # it as an unsupported column.)
        conditions.append(
            {"field": "locations.country", "type": "in", "value": countries}
        )

    if not conditions:
        # Fall back to "any company with >=50 employees" so we still get *something*.
        conditions.append({"field": "headcount.total", "type": "=>", "value": 50})

    return _and_group(conditions)


def _person_search_filters(filters: dict[str, Any], company_names: list[str]) -> dict[str, Any]:
    conditions: list[dict[str, Any]] = []

    seniority = filters.get("seniority_levels") or []
    if seniority:
        conditions.append(
            {
                "field": "experience.employment_details.current.seniority_level",
                "type": "in",
                "value": seniority,
            }
        )

    title_keyword = (filters.get("title_keyword") or "").strip()
    if title_keyword:
        # Single regex on current.title — keep it broad. Crustdata returns
        # zero rows when two `(.)` conditions are AND'd on the same field,
        # so we rely on seniority_level for the "VP / Director" half.
        conditions.append(
            {
                "field": "experience.employment_details.current.title",
                "type": "(.)",
                "value": title_keyword,
            }
        )

    if company_names:
        conditions.append(
            {
                "field": "experience.employment_details.current.company_name",
                "type": "in",
                "value": company_names,
            }
        )
    else:
        countries = _countries_iso3(filters)
        if countries:
            conditions.append(
                {
                    "field": "experience.employment_details.company_headquarters_country",
                    "type": "in",
                    "value": countries,
                }
            )

    if not conditions:
        conditions.append(
            {
                "field": "experience.employment_details.current.seniority_level",
                "type": "in",
                "value": ["Vice President", "Director", "CXO"],
            }
        )

    return _and_group(conditions)


# ---------------------------------------------------------------------------
# Defensive extractors (Crustdata payloads can be deeply nested)
# ---------------------------------------------------------------------------


def _dig(obj: Any, *path: str, default: Any = None) -> Any:
    cur = obj
    for key in path:
        if isinstance(cur, dict) and key in cur:
            cur = cur[key]
        else:
            return default
    return cur if cur is not None else default


def _company_basics(company_data: dict[str, Any]) -> dict[str, Any]:
    basic = _dig(company_data, "basic_info", default={}) or {}
    locations = _dig(company_data, "locations", default={}) or {}
    return {
        "name": basic.get("name") or basic.get("company_name") or "",
        "domain": basic.get("primary_domain") or basic.get("domain"),
        "crustdata_company_id": (
            company_data.get("crustdata_company_id")
            or basic.get("crustdata_company_id")
        ),
        "industry": (basic.get("industries") or [None])[0] if basic.get("industries") else None,
        "hq_country": locations.get("country") or locations.get("hq_country"),
        "hq_city": locations.get("city") or locations.get("hq_city"),
    }


def _flatten_strings(items: Any, *keys: str) -> list[str]:
    """Flatten a list whose elements are strings OR dicts.

    For dicts we try ``keys`` in order and pick the first truthy string we
    find. Crustdata ``contact`` payloads vary subtly between accounts/plans,
    so we keep this defensive.
    """
    out: list[str] = []
    if not isinstance(items, list):
        return out
    for it in items:
        if isinstance(it, str):
            v = it.strip()
            if v and v not in out:
                out.append(v)
            continue
        if isinstance(it, dict):
            for k in keys:
                v = it.get(k)
                if isinstance(v, str) and v.strip():
                    v = v.strip()
                    if v not in out:
                        out.append(v)
                    break
    return out


def _person_basics(person_data: dict[str, Any]) -> dict[str, Any]:
    basic = _dig(person_data, "basic_profile", default={}) or {}
    current = (
        _dig(person_data, "experience", "employment_details", "current", default=[])
        or []
    )
    if isinstance(current, dict):
        current_role = current
    elif current:
        current_role = current[0]
    else:
        current_role = {}
    location = basic.get("location") or {}
    company_name = current_role.get("name") or current_role.get("company_name") or ""

    contact = _dig(person_data, "contact", default={}) or {}
    business_emails = _flatten_strings(
        contact.get("business_emails"),
        "email", "address", "value", "business_email",
    )
    personal_emails = _flatten_strings(
        contact.get("personal_emails"),
        "email", "address", "value", "personal_email",
    )
    phone_numbers = _flatten_strings(
        contact.get("phone_numbers"),
        "phone_number", "number", "value", "phone",
    )
    websites = _flatten_strings(
        contact.get("websites"),
        "url", "website", "value",
    )

    return {
        "name": basic.get("name")
        or " ".join(filter(None, [basic.get("first_name"), basic.get("last_name")])).strip(),
        "title": current_role.get("title", ""),
        "company": company_name,
        "company_domain": current_role.get("company_website_domain"),
        "crustdata_company_id": current_role.get("crustdata_company_id"),
        "location": location.get("full_location")
        or ", ".join(filter(None, [location.get("city"), location.get("country")]))
        or basic.get("headline", ""),
        "profile_url": (
            _dig(person_data, "social_handles", "professional_network_identifier", "profile_url")
            or basic.get("linkedin_url")
            or basic.get("professional_network_profile_url")
            or _dig(person_data, "professional_network", "profile_url")
        ),
        "business_emails": business_emails,
        "personal_emails": personal_emails,
        "phone_numbers": phone_numbers,
        "websites": websites,
    }


def _person_search_profile_urls(search_resp: dict[str, Any]) -> list[str]:
    profiles = search_resp.get("profiles") or search_resp.get("results") or []
    urls: list[str] = []
    for p in profiles:
        url = (
            _dig(p, "social_handles", "professional_network_identifier", "profile_url")
            or _dig(p, "basic_profile", "linkedin_url")
            or _dig(p, "basic_profile", "professional_network_profile_url")
            or _dig(p, "professional_network", "profile_url")
            or p.get("linkedin_url")
            or p.get("profile_url")
        )
        if url:
            urls.append(url)
    return urls


def _company_signals(enrich_match: dict[str, Any]) -> dict[str, Any]:
    company_data = _dig(enrich_match, "company_data", default={}) or {}
    news = _dig(company_data, "news", default=[]) or []
    hiring = _dig(company_data, "hiring", default={}) or {}
    funding = _dig(company_data, "funding", default={}) or {}
    if isinstance(news, dict):
        news = news.get("articles") or news.get("items") or []
    # Crustdata news entries use `article_*` keys — normalise into a stable
    # internal shape used by the hook builder + LLM briefing prompt.
    norm_news = []
    for n in news[:5]:
        norm_news.append(
            {
                "title": n.get("article_title") or n.get("title") or n.get("headline"),
                "publisher": n.get("article_publisher_name")
                or n.get("publisher")
                or n.get("source"),
                "date": n.get("article_publish_date")
                or n.get("publish_date")
                or n.get("date"),
                "url": n.get("article_url") or n.get("url"),
            }
        )
    return {
        "news": norm_news,
        "hiring": {
            "openings_count": hiring.get("openings_count"),
            "openings_growth_percent": hiring.get("openings_growth_percent"),
            "recent_titles_csv": hiring.get("recent_titles_csv"),
        },
        "funding": {
            "last_round_type": funding.get("last_round_type"),
            "last_fundraise_date": funding.get("last_fundraise_date"),
            "total_investment_usd": funding.get("total_investment_usd"),
        },
    }


def _hook_from_signals(signals: dict[str, Any]) -> str:
    hiring = signals.get("hiring") or {}
    if hiring.get("recent_titles_csv"):
        first = hiring["recent_titles_csv"].split(",")[0].strip()
        return f"Hiring: {first} ({hiring.get('openings_count') or '?'} open roles)"
    funding = signals.get("funding") or {}
    if funding.get("last_round_type") and funding.get("last_fundraise_date"):
        return f"Raised {funding['last_round_type']} on {funding['last_fundraise_date']}"
    news = signals.get("news") or []
    if news and news[0].get("title"):
        return news[0]["title"]
    return "ICP-matched company"


def _company_news_blurb(signals: dict[str, Any]) -> str:
    news = signals.get("news") or []
    if not news:
        return ""
    head = news[0]
    pieces = [p for p in [head.get("title"), head.get("publisher"), head.get("date")] if p]
    return " — ".join(pieces) if pieces else ""


# ---------------------------------------------------------------------------
# Stage 1: resolve target companies
# ---------------------------------------------------------------------------


async def _resolve_companies(client: CrustdataClient, filters: dict[str, Any]) -> list[dict[str, Any]]:
    explicit_names: list[str] = filters.get("companies") or []

    if explicit_names:
        try:
            results = await client.identify_companies(names=explicit_names)
        except CrustdataError as e:
            log.warning("identify_companies failed: %s", e)
            return []
        companies: list[dict[str, Any]] = []
        for entry in results or []:
            for match in entry.get("matches") or []:
                cd = match.get("company_data") or {}
                cd.setdefault("basic_info", {})
                # propagate crustdata_company_id if it's at top level
                if match.get("crustdata_company_id") and not cd["basic_info"].get(
                    "crustdata_company_id"
                ):
                    cd["basic_info"]["crustdata_company_id"] = match["crustdata_company_id"]
                companies.append(cd)
                if len(companies) >= MAX_COMPANIES:
                    break
            if len(companies) >= MAX_COMPANIES:
                break
        return companies

    try:
        resp = await client.search_companies(
            filters=_company_search_filters(filters),
            fields=[
                "crustdata_company_id",
                "basic_info.name",
                "basic_info.primary_domain",
                "basic_info.industries",
                "locations.country",
                "locations.city",
                "headcount.total",
            ],
            sorts=[{"column": "headcount.total", "order": "desc"}],
            limit=MAX_COMPANIES,
        )
    except CrustdataError as e:
        log.warning("search_companies failed: %s", e)
        return []
    return (resp.get("companies") or [])[:MAX_COMPANIES]


# ---------------------------------------------------------------------------
# Stage 2: find decision-makers for the company set
# ---------------------------------------------------------------------------


async def _find_persons(
    client: CrustdataClient,
    filters: dict[str, Any],
    companies: list[dict[str, Any]],
) -> list[str]:
    company_names = [
        c.get("basic_info", {}).get("name")
        for c in companies
        if c.get("basic_info", {}).get("name")
    ]
    person_filters = _person_search_filters(filters, company_names)
    try:
        resp = await client.search_persons(
            filters=person_filters,
            fields=[
                "basic_profile.name",
                "experience.employment_details.current.title",
                "experience.employment_details.current.company_name",
                "social_handles.professional_network_identifier.profile_url",
            ],
            sorts=[{"field": "metadata.updated_at", "order": "desc"}],
            limit=MAX_PERSON_SEARCH,
        )
    except CrustdataError as e:
        log.warning("search_persons failed: %s", e)
        return []
    return _person_search_profile_urls(resp)


# ---------------------------------------------------------------------------
# Stage 3+4: enrich persons + companies in parallel
# ---------------------------------------------------------------------------


async def _enrich_persons(client: CrustdataClient, profile_urls: list[str]) -> list[dict[str, Any]]:
    if not profile_urls:
        return []
    out: list[dict[str, Any]] = []
    for i in range(0, len(profile_urls), 25):
        batch = profile_urls[i : i + 25]
        try:
            resp = await client.enrich_persons(profile_urls=batch, fields=PERSON_FIELDS)
        except CrustdataError as e:
            log.warning("enrich_persons batch failed: %s", e)
            continue
        for entry in resp or []:
            for match in entry.get("matches") or []:
                pd = match.get("person_data")
                if pd:
                    out.append(pd)
    return out


async def _enrich_companies(
    client: CrustdataClient,
    company_keys: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Returns map keyed by lowercased company name -> signals dict.

    Prefer enriching by ``crustdata_company_id`` — domain enrich is fuzzy
    and frequently returns the wrong sub-brand (e.g. accor.com -> Sofitel
    Riyadh).
    """
    if not company_keys:
        return {}
    ids = [k["id"] for k in company_keys.values() if k.get("id")]
    fallback_domains = [
        k["domain"]
        for k in company_keys.values()
        if not k.get("id") and k.get("domain")
    ]
    fallback_names = [
        k["name"]
        for k in company_keys.values()
        if not k.get("id") and not k.get("domain") and k.get("name")
    ]

    results: list[dict[str, Any]] = []
    try:
        if ids:
            results.extend(
                await client.enrich_companies(
                    crustdata_company_ids=ids, fields=COMPANY_ENRICH_FIELDS
                )
                or []
            )
        if fallback_domains:
            results.extend(
                await client.enrich_companies(
                    domains=fallback_domains, fields=COMPANY_ENRICH_FIELDS
                )
                or []
            )
        if fallback_names:
            results.extend(
                await client.enrich_companies(
                    names=fallback_names, fields=COMPANY_ENRICH_FIELDS
                )
                or []
            )
    except CrustdataError as e:
        log.warning("enrich_companies failed: %s", e)

    by_name: dict[str, dict[str, Any]] = {}
    for entry in results:
        for match in entry.get("matches") or []:
            cd = match.get("company_data") or {}
            name = (
                _dig(cd, "basic_info", "name")
                or _dig(cd, "basic_info", "company_name")
                or ""
            )
            if name:
                by_name[name.strip().lower()] = _company_signals(match)
    return by_name


# ---------------------------------------------------------------------------
# Top-level orchestrator
# ---------------------------------------------------------------------------


async def run_enrich(filters: dict[str, Any]) -> dict[str, Any]:
    """Returns {"prospects": [...], "stats": {...}}.

    Stats keys are the per-stage counts the agent-reasoning panel renders:
        companies_matched, candidates_found, profiles_enriched.
    """
    async with CrustdataClient() as client:
        companies = await _resolve_companies(client, filters)
        log.info("resolved %d companies", len(companies))

        profile_urls = await _find_persons(client, filters, companies)
        log.info("found %d person profile urls", len(profile_urls))

        person_data_list = await _enrich_persons(client, profile_urls)
        log.info("enriched %d persons", len(person_data_list))

        stats = {
            "companies_matched": len(companies),
            "candidates_found": len(profile_urls),
            "profiles_enriched": len(person_data_list),
        }

        # Build base prospect rows + the company key set we need to enrich.
        prospects_raw: list[dict[str, Any]] = []
        company_keys: dict[str, dict[str, Any]] = {}

        for cd in companies:
            basics = _company_basics(cd)
            key = (basics["name"] or basics.get("domain") or "").strip().lower()
            if key and key not in company_keys:
                company_keys[key] = {
                    "id": basics.get("crustdata_company_id"),
                    "domain": basics.get("domain"),
                    "name": basics["name"],
                }

        for pd in person_data_list:
            basics = _person_basics(pd)
            if not basics["name"]:
                continue
            key = (basics["company"] or "").strip().lower()
            if key and key not in company_keys:
                company_keys[key] = {
                    "id": basics.get("crustdata_company_id"),
                    "domain": basics.get("company_domain"),
                    "name": basics["company"],
                }
            elif key and not company_keys[key].get("id") and basics.get("crustdata_company_id"):
                company_keys[key]["id"] = basics["crustdata_company_id"]
                company_keys[key]["domain"] = (
                    company_keys[key].get("domain") or basics.get("company_domain")
                )
            prospects_raw.append({**basics})

        # Cap company-name distribution so we don't show 4 people from the same place.
        capped: list[dict[str, Any]] = []
        per_company_count: dict[str, int] = {}
        for p in prospects_raw:
            ckey = (p.get("company") or "").strip().lower()
            if per_company_count.get(ckey, 0) >= MAX_PERSONS_PER_COMPANY:
                continue
            per_company_count[ckey] = per_company_count.get(ckey, 0) + 1
            capped.append(p)
        prospects_raw = capped[: MAX_RESULT_PROSPECTS * 2]

        # Pull company signals + LLM briefings concurrently.
        company_signals_map = await _enrich_companies(client, company_keys)

    async def _briefing_for(p: dict[str, Any]) -> dict[str, Any]:
        signals = company_signals_map.get((p.get("company") or "").strip().lower(), {})
        p["companyNews"] = _company_news_blurb(signals)
        p["hook"] = _hook_from_signals(signals) if signals else ""
        p["raw_signals"] = signals
        try:
            briefing = await generate_briefing(
                {
                    "name": p["name"],
                    "title": p["title"],
                    "company": p["company"],
                    "location": p["location"],
                    "recentPost": p.get("recentPost", ""),
                },
                signals,
                filters.get("raw", ""),
            )
        except Exception as e:
            log.warning("briefing failed for %s: %s", p.get("name"), e)
            briefing = {"painPoint": "", "talkingPoints": []}
        p["painPoint"] = briefing.get("painPoint", "")
        p["talkingPoints"] = briefing.get("talkingPoints", []) or []
        # Outreach + score happen in their own scaffold steps.
        p.setdefault("recentPost", "")
        p.setdefault("emailSubject", "")
        p.setdefault("emailBody", "")
        p.setdefault("score", 0)
        return p

    enriched = await asyncio.gather(*[_briefing_for(p) for p in prospects_raw])
    enriched = list(enriched[:MAX_RESULT_PROSPECTS])
    return {"prospects": enriched, "stats": stats}


# ---------------------------------------------------------------------------
# Web signals (called by /api/web-signals)
# ---------------------------------------------------------------------------


def _format_web_hit(hit: dict[str, Any]) -> str:
    snippet = hit.get("snippet") or hit.get("description") or hit.get("text") or ""
    title = hit.get("title") or ""
    source = hit.get("source") or hit.get("domain") or hit.get("publisher") or ""
    date = hit.get("date") or hit.get("published_at") or ""
    quote = (snippet or title or "").strip().strip('"')
    if not quote:
        return ""
    suffix = " — ".join([s for s in [source, date] if s])
    return f"\u201c{quote}\u201d{(' — ' + suffix) if suffix else ''}"


async def fetch_web_signals(prospects: list[dict[str, Any]]) -> dict[str, Any]:
    """Returns {"prospects": [...], "stats": {"signals_found": N}}."""
    async with CrustdataClient() as client:
        async def one(p: dict[str, Any]) -> tuple[dict[str, Any], bool]:
            name = p.get("name", "")
            company = p.get("company", "")
            if not name or not company:
                return p, False
            query = f'"{name}" "{company}"'
            try:
                resp = await client.web_search(query=query, limit=3)
            except CrustdataError as e:
                log.warning("web_search failed for %s: %s", name, e)
                return p, False
            hits = (
                resp.get("results")
                or resp.get("hits")
                or resp.get("items")
                or []
            )
            if not hits:
                return p, False
            formatted = _format_web_hit(hits[0])
            found = False
            if formatted:
                p["recentPost"] = formatted
                found = True
                if not p.get("hook"):
                    snippet_short = (
                        hits[0].get("title")
                        or hits[0].get("snippet", "")[:80]
                    )
                    if snippet_short:
                        p["hook"] = snippet_short
            return p, found

        results = await asyncio.gather(*[one(dict(p)) for p in prospects])
        out_prospects = [p for p, _ in results]
        signals_found = sum(1 for _, ok in results if ok)
        return {
            "prospects": out_prospects,
            "stats": {"signals_found": signals_found},
        }
