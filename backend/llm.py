"""OpenAI wrappers for the four LLM-shaped pipeline steps.

All calls use JSON mode + tight prompts so we can `json.loads` the response
directly into the pydantic schemas.
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from typing import Any

from openai import AsyncOpenAI

log = logging.getLogger("llm")

DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")


@lru_cache(maxsize=1)
def _client() -> AsyncOpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return AsyncOpenAI(api_key=api_key)


async def _chat_json(system: str, user: str, *, model: str | None = None) -> dict[str, Any]:
    model_id = model or DEFAULT_MODEL
    log.debug("openai chat (%s): %s", model_id, user[:120])
    resp = await _client().chat.completions.create(
        model=model_id,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    content = resp.choices[0].message.content or "{}"
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        log.warning("non-JSON LLM reply, falling back to empty dict: %s", content[:200])
        return {}


# ---------------------------------------------------------------------------
# 1. Parse natural-language query into structured ICP filters
# ---------------------------------------------------------------------------

PARSE_SYSTEM = """You convert a sales user's natural-language prospect query
into a structured ICP filter object for a B2B search API. Always respond with
valid JSON. Only include fields that the user's query actually constrains."""

PARSE_USER_TEMPLATE = """Query: {query}

Respond with a JSON object with these keys (omit a field if not implied):
- titles: array of 1-5 likely job titles (strings)
- industries: array of 1-3 industry labels (strings, e.g. "Hospitality")
- regions: array of 1-3 human-readable region names (strings, e.g. "Southeast Asia")
- country_iso3: single ISO-3 country code if a single country is implied (e.g. "THA"), else null
- keywords: array of 1-5 short topical keywords mentioned (strings)
- companies: array of specific company names if the user named any, else []

Return JSON only. No prose."""


async def parse_query(query: str) -> dict[str, Any]:
    data = await _chat_json(PARSE_SYSTEM, PARSE_USER_TEMPLATE.format(query=query))
    data.setdefault("titles", [])
    data.setdefault("industries", [])
    data.setdefault("regions", [])
    data.setdefault("keywords", [])
    data.setdefault("companies", [])
    data.setdefault("country_iso3", None)
    data["raw"] = query
    return data


# ---------------------------------------------------------------------------
# 2. Briefing — pain point + talking points from real signals
# ---------------------------------------------------------------------------

BRIEFING_SYSTEM = """You are a senior B2B sales strategist preparing a 30-second
pre-call briefing. Be specific, evidence-based, and concise. Always reference
the supplied signals — never invent facts. Always respond with valid JSON."""

BRIEFING_USER_TEMPLATE = """Prospect: {name}, {title} at {company} ({location})

Original ICP query:
"{query}"

Recent company signals (news, hiring, funding) — use these as evidence:
{signals_json}

Recent web/post signal (may be empty):
{recent_post}

Respond with a JSON object:
{{
  "painPoint": "1-2 sentences naming the *specific* pain implied by the signals",
  "talkingPoints": ["3 short bullets, each citing a concrete signal or angle"]
}}

Return JSON only."""


async def generate_briefing(prospect: dict[str, Any], signals: dict[str, Any], query: str) -> dict[str, Any]:
    data = await _chat_json(
        BRIEFING_SYSTEM,
        BRIEFING_USER_TEMPLATE.format(
            name=prospect.get("name", ""),
            title=prospect.get("title", ""),
            company=prospect.get("company", ""),
            location=prospect.get("location", ""),
            query=query or "(no original query)",
            signals_json=json.dumps(signals, indent=2)[:3000],
            recent_post=prospect.get("recentPost") or prospect.get("recent_post") or "(none)",
        ),
    )
    return {
        "painPoint": data.get("painPoint", ""),
        "talkingPoints": data.get("talkingPoints", []) or [],
    }


# ---------------------------------------------------------------------------
# 3. Why-Now score
# ---------------------------------------------------------------------------

SCORE_SYSTEM = """You are a strict B2B intent-scoring model. Given a prospect
and their signals, output a single integer Why-Now score from 0-100. Higher
means stronger active intent right now. Always respond with JSON."""

SCORE_USER_TEMPLATE = """Prospect: {name}, {title} at {company}.

Signals:
{signals_json}

Scoring guide:
- 0-39 cold: no active signals.
- 40-69 warm: stale or indirect signals.
- 70-89 hot: a recent, on-topic signal (news, post, hiring) within the last ~60 days.
- 90-100 burning: prospect has *publicly* expressed the exact pain or is hiring for it now.

Return JSON: {{"score": <int>}}"""


async def score_prospect(prospect: dict[str, Any], signals: dict[str, Any]) -> int:
    data = await _chat_json(
        SCORE_SYSTEM,
        SCORE_USER_TEMPLATE.format(
            name=prospect.get("name", ""),
            title=prospect.get("title", ""),
            company=prospect.get("company", ""),
            signals_json=json.dumps(signals, indent=2)[:2000],
        ),
    )
    try:
        score = int(data.get("score", 0))
    except (TypeError, ValueError):
        score = 0
    return max(0, min(100, score))


# ---------------------------------------------------------------------------
# 4. Outreach email
# ---------------------------------------------------------------------------

OUTREACH_SYSTEM = """You are a senior B2B SDR known for warm, specific cold
emails that get replies. Style: human, direct, no jargon, no hype, no emojis.
Always respond with JSON."""

OUTREACH_USER_TEMPLATE = """Write a cold email to this prospect.

Prospect: {name}, {title} at {company} ({location})
Why-Now score: {score}
Signal hook: {hook}
Company news: {company_news}
Their recent post: {recent_post}
Inferred pain point: {pain_point}
Talking points (use 1-2):
{talking_points}

Constraints:
- Subject: <= 60 characters, references the actual signal or pain.
- Body: 80-130 words, plain text with newlines, opens by name, references the
  signal directly, ends with a soft 20-minute call ask.
- No "I hope this email finds you well" or other filler.
- Sign off as "Alex".

Return JSON: {{"subject": "...", "body": "..."}}"""


async def generate_outreach(prospect: dict[str, Any]) -> dict[str, str]:
    data = await _chat_json(
        OUTREACH_SYSTEM,
        OUTREACH_USER_TEMPLATE.format(
            name=prospect.get("name", ""),
            title=prospect.get("title", ""),
            company=prospect.get("company", ""),
            location=prospect.get("location", ""),
            score=prospect.get("score", 0),
            hook=prospect.get("hook", ""),
            company_news=prospect.get("companyNews") or prospect.get("company_news", ""),
            recent_post=prospect.get("recentPost") or prospect.get("recent_post", ""),
            pain_point=prospect.get("painPoint") or prospect.get("pain_point", ""),
            talking_points="\n".join(
                f"- {tp}"
                for tp in (prospect.get("talkingPoints") or prospect.get("talking_points") or [])
            )
            or "(none)",
        ),
    )
    return {
        "subject": str(data.get("subject", "")).strip(),
        "body": str(data.get("body", "")).strip(),
    }
