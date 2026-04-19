// Crustdata enrichment pipeline (Recipe D from the API docs).
//
// Combines:
//   /company/identify | /company/search   ->  target companies
//   /person/search                         ->  candidate decision-makers
//   /person/enrich   (batched up to 25)    ->  full profiles + contact
//   /company/enrich  (news/hiring/funding) ->  per-company signal context
//   llm.generateBriefing                   ->  painPoint + talkingPoints
//
// NOTE on filter schema (verified empirically against the live API — the public
// docs are partly wrong):
//
// - Leaf condition: {"field": ..., "type": <operator>, "value": ...}.
//   Operator goes in `type` (not `op`).
// - Group: {"op": "and"|"or", "conditions": [...]}. `op` is reserved for
//   groups; leaves never use it.
// - Sort entries are inconsistent across endpoints:
//     /company/search -> {"column": ..., "order": ...}
//     /person/search  -> {"field":  ..., "order": ...}
// - Country filter for company search lives at `locations.country` (ISO3),
//   not `locations.hq_country` as the docs claim.
// - Two `(.)` regex conditions on the same person field rarely match. Use
//   `current.seniority_level` (enum) + a single `current.title` regex
//   instead.

import { CrustdataClient, CrustdataError } from './crustdata.js';
import { generateBriefing } from './llm.js';

const MAX_COMPANIES = 8;
const MAX_PERSONS_PER_COMPANY = 4;
const MAX_PERSON_SEARCH = 15;
const MAX_RESULT_PROSPECTS = 5;
const PERSON_FIELDS = [
  'basic_profile',
  'experience',
  'contact',
  'professional_network',
];
const COMPANY_ENRICH_FIELDS = ['basic_info', 'news', 'hiring', 'funding'];

// ---------------------------------------------------------------------------
// Filter -> Crustdata request translation
// ---------------------------------------------------------------------------

function andGroup(conditions) {
  // Always wrap conditions in an "and" group — Crustdata rejects bare leaves.
  return { op: 'and', conditions };
}

// (kept for parity with the Python version even if unused at the moment)
// eslint-disable-next-line no-unused-vars
function orGroup(conditions) {
  return { op: 'or', conditions };
}

function countriesIso3(filters) {
  const multi = filters?.countries_iso3 || [];
  if (Array.isArray(multi)) return multi.filter((c) => typeof c === 'string' && c);
  return [];
}

function companySearchFilters(filters) {
  const conditions = [];

  const industries = filters?.industries || [];
  if (industries.length) {
    conditions.push({ field: 'basic_info.industries', type: 'in', value: industries });
  }

  const countries = countriesIso3(filters);
  if (countries.length) {
    // `locations.country` is the *real* ISO3 country filter for company
    // search. (Docs list `locations.hq_country` but the live API rejects
    // it as an unsupported column.)
    conditions.push({ field: 'locations.country', type: 'in', value: countries });
  }

  if (conditions.length === 0) {
    // Fall back to "any company with >=50 employees" so we still get *something*.
    conditions.push({ field: 'headcount.total', type: '=>', value: 50 });
  }

  return andGroup(conditions);
}

function personSearchFilters(filters, companyNames) {
  const conditions = [];

  const seniority = filters?.seniority_levels || [];
  if (seniority.length) {
    conditions.push({
      field: 'experience.employment_details.current.seniority_level',
      type: 'in',
      value: seniority,
    });
  }

  const titleKeyword = (filters?.title_keyword || '').trim();
  if (titleKeyword) {
    // Single regex on current.title — keep it broad. Crustdata returns
    // zero rows when two `(.)` conditions are AND'd on the same field,
    // so we rely on seniority_level for the "VP / Director" half.
    conditions.push({
      field: 'experience.employment_details.current.title',
      type: '(.)',
      value: titleKeyword,
    });
  }

  if (companyNames && companyNames.length) {
    conditions.push({
      field: 'experience.employment_details.current.company_name',
      type: 'in',
      value: companyNames,
    });
  } else {
    const countries = countriesIso3(filters);
    if (countries.length) {
      conditions.push({
        field: 'experience.employment_details.company_headquarters_country',
        type: 'in',
        value: countries,
      });
    }
  }

  if (conditions.length === 0) {
    conditions.push({
      field: 'experience.employment_details.current.seniority_level',
      type: 'in',
      value: ['Vice President', 'Director', 'CXO'],
    });
  }

  return andGroup(conditions);
}

// ---------------------------------------------------------------------------
// Defensive extractors (Crustdata payloads can be deeply nested)
// ---------------------------------------------------------------------------

function dig(obj, path, defaultValue = null) {
  let cur = obj;
  for (const key of path) {
    if (cur && typeof cur === 'object' && key in cur) {
      cur = cur[key];
    } else {
      return defaultValue;
    }
  }
  return cur ?? defaultValue;
}

function companyBasics(companyData) {
  const basic = dig(companyData, ['basic_info'], {}) || {};
  const locations = dig(companyData, ['locations'], {}) || {};
  const industries = basic.industries;
  return {
    name: basic.name || basic.company_name || '',
    domain: basic.primary_domain || basic.domain,
    crustdata_company_id:
      companyData?.crustdata_company_id || basic.crustdata_company_id,
    industry: Array.isArray(industries) && industries.length ? industries[0] : null,
    hq_country: locations.country || locations.hq_country,
    hq_city: locations.city || locations.hq_city,
  };
}

// Flatten a list whose elements are strings OR dicts.
//
// For dicts we try `keys` in order and pick the first truthy string we
// find. Crustdata `contact` payloads vary subtly between accounts/plans,
// so we keep this defensive.
function flattenStrings(items, keys) {
  const out = [];
  if (!Array.isArray(items)) return out;
  for (const it of items) {
    if (typeof it === 'string') {
      const v = it.trim();
      if (v && !out.includes(v)) out.push(v);
      continue;
    }
    if (it && typeof it === 'object') {
      for (const k of keys) {
        const v = it[k];
        if (typeof v === 'string' && v.trim()) {
          const t = v.trim();
          if (!out.includes(t)) out.push(t);
          break;
        }
      }
    }
  }
  return out;
}

function personBasics(personData) {
  const basic = dig(personData, ['basic_profile'], {}) || {};
  let current = dig(personData, ['experience', 'employment_details', 'current'], []) || [];
  let currentRole;
  if (current && typeof current === 'object' && !Array.isArray(current)) {
    currentRole = current;
  } else if (Array.isArray(current) && current.length) {
    currentRole = current[0];
  } else {
    currentRole = {};
  }
  const location = basic.location || {};
  const companyName = currentRole.name || currentRole.company_name || '';

  const contact = dig(personData, ['contact'], {}) || {};
  const businessEmails = flattenStrings(contact.business_emails, [
    'email',
    'address',
    'value',
    'business_email',
  ]);
  const personalEmails = flattenStrings(contact.personal_emails, [
    'email',
    'address',
    'value',
    'personal_email',
  ]);
  const phoneNumbers = flattenStrings(contact.phone_numbers, [
    'phone_number',
    'number',
    'value',
    'phone',
  ]);
  const websites = flattenStrings(contact.websites, ['url', 'website', 'value']);

  const fullName =
    basic.name ||
    [basic.first_name, basic.last_name].filter(Boolean).join(' ').trim();

  const fullLocation =
    location.full_location ||
    [location.city, location.country].filter(Boolean).join(', ') ||
    basic.headline ||
    '';

  return {
    name: fullName,
    title: currentRole.title || '',
    company: companyName,
    company_domain: currentRole.company_website_domain,
    crustdata_company_id: currentRole.crustdata_company_id,
    location: fullLocation,
    profile_url:
      dig(personData, [
        'social_handles',
        'professional_network_identifier',
        'profile_url',
      ]) ||
      basic.linkedin_url ||
      basic.professional_network_profile_url ||
      dig(personData, ['professional_network', 'profile_url']),
    business_emails: businessEmails,
    personal_emails: personalEmails,
    phone_numbers: phoneNumbers,
    websites,
  };
}

function personSearchProfileUrls(searchResp) {
  const profiles = searchResp?.profiles || searchResp?.results || [];
  const urls = [];
  for (const p of profiles) {
    const url =
      dig(p, ['social_handles', 'professional_network_identifier', 'profile_url']) ||
      dig(p, ['basic_profile', 'linkedin_url']) ||
      dig(p, ['basic_profile', 'professional_network_profile_url']) ||
      dig(p, ['professional_network', 'profile_url']) ||
      p?.linkedin_url ||
      p?.profile_url;
    if (url) urls.push(url);
  }
  return urls;
}

function companySignals(enrichMatch) {
  const companyData = dig(enrichMatch, ['company_data'], {}) || {};
  let news = dig(companyData, ['news'], []) || [];
  const hiring = dig(companyData, ['hiring'], {}) || {};
  const funding = dig(companyData, ['funding'], {}) || {};
  if (news && typeof news === 'object' && !Array.isArray(news)) {
    news = news.articles || news.items || [];
  }
  // Crustdata news entries use `article_*` keys — normalise into a stable
  // internal shape used by the hook builder + LLM briefing prompt.
  const normNews = [];
  for (const n of news.slice(0, 5)) {
    normNews.push({
      title: n.article_title || n.title || n.headline,
      publisher: n.article_publisher_name || n.publisher || n.source,
      date: n.article_publish_date || n.publish_date || n.date,
      url: n.article_url || n.url,
    });
  }
  return {
    news: normNews,
    hiring: {
      openings_count: hiring.openings_count,
      openings_growth_percent: hiring.openings_growth_percent,
      recent_titles_csv: hiring.recent_titles_csv,
    },
    funding: {
      last_round_type: funding.last_round_type,
      last_fundraise_date: funding.last_fundraise_date,
      total_investment_usd: funding.total_investment_usd,
    },
  };
}

function hookFromSignals(signals) {
  const hiring = signals?.hiring || {};
  if (hiring.recent_titles_csv) {
    const first = String(hiring.recent_titles_csv).split(',')[0].trim();
    return `Hiring: ${first} (${hiring.openings_count ?? '?'} open roles)`;
  }
  const funding = signals?.funding || {};
  if (funding.last_round_type && funding.last_fundraise_date) {
    return `Raised ${funding.last_round_type} on ${funding.last_fundraise_date}`;
  }
  const news = signals?.news || [];
  if (news.length && news[0].title) return news[0].title;
  return 'ICP-matched company';
}

function companyNewsBlurb(signals) {
  const news = signals?.news || [];
  if (!news.length) return '';
  const head = news[0];
  const pieces = [head.title, head.publisher, head.date].filter(Boolean);
  return pieces.length ? pieces.join(' — ') : '';
}

// ---------------------------------------------------------------------------
// Stage 1: resolve target companies
// ---------------------------------------------------------------------------

async function resolveCompanies(client, filters) {
  const explicitNames = filters?.companies || [];

  if (explicitNames.length) {
    let results;
    try {
      results = await client.identifyCompanies({ names: explicitNames });
    } catch (e) {
      if (e instanceof CrustdataError) {
        console.warn('identify_companies failed:', e.message);
        return [];
      }
      throw e;
    }
    const companies = [];
    for (const entry of results || []) {
      for (const match of entry.matches || []) {
        const cd = match.company_data || {};
        if (!cd.basic_info) cd.basic_info = {};
        if (
          match.crustdata_company_id &&
          !cd.basic_info.crustdata_company_id
        ) {
          cd.basic_info.crustdata_company_id = match.crustdata_company_id;
        }
        companies.push(cd);
        if (companies.length >= MAX_COMPANIES) break;
      }
      if (companies.length >= MAX_COMPANIES) break;
    }
    return companies;
  }

  let resp;
  try {
    resp = await client.searchCompanies({
      filters: companySearchFilters(filters),
      fields: [
        'crustdata_company_id',
        'basic_info.name',
        'basic_info.primary_domain',
        'basic_info.industries',
        'locations.country',
        'locations.city',
        'headcount.total',
      ],
      sorts: [{ column: 'headcount.total', order: 'desc' }],
      limit: MAX_COMPANIES,
    });
  } catch (e) {
    if (e instanceof CrustdataError) {
      console.warn('search_companies failed:', e.message);
      return [];
    }
    throw e;
  }
  return (resp?.companies || []).slice(0, MAX_COMPANIES);
}

// ---------------------------------------------------------------------------
// Stage 2: find decision-makers for the company set
// ---------------------------------------------------------------------------

async function findPersons(client, filters, companies) {
  const companyNames = companies
    .map((c) => c?.basic_info?.name)
    .filter(Boolean);
  const personFilters = personSearchFilters(filters, companyNames);
  let resp;
  try {
    resp = await client.searchPersons({
      filters: personFilters,
      fields: [
        'basic_profile.name',
        'experience.employment_details.current.title',
        'experience.employment_details.current.company_name',
        'social_handles.professional_network_identifier.profile_url',
      ],
      sorts: [{ field: 'metadata.updated_at', order: 'desc' }],
      limit: MAX_PERSON_SEARCH,
    });
  } catch (e) {
    if (e instanceof CrustdataError) {
      console.warn('search_persons failed:', e.message);
      return [];
    }
    throw e;
  }
  return personSearchProfileUrls(resp);
}

// ---------------------------------------------------------------------------
// Stage 3+4: enrich persons + companies
// ---------------------------------------------------------------------------

async function enrichPersons(client, profileUrls) {
  if (!profileUrls.length) return [];
  const out = [];
  for (let i = 0; i < profileUrls.length; i += 25) {
    const batch = profileUrls.slice(i, i + 25);
    let resp;
    try {
      resp = await client.enrichPersons({
        profileUrls: batch,
        fields: PERSON_FIELDS,
      });
    } catch (e) {
      if (e instanceof CrustdataError) {
        console.warn('enrich_persons batch failed:', e.message);
        continue;
      }
      throw e;
    }
    for (const entry of resp || []) {
      for (const match of entry.matches || []) {
        const pd = match.person_data;
        if (pd) out.push(pd);
      }
    }
  }
  return out;
}

// Returns map keyed by lowercased company name -> signals dict.
//
// Prefer enriching by `crustdata_company_id` — domain enrich is fuzzy
// and frequently returns the wrong sub-brand (e.g. accor.com -> Sofitel
// Riyadh).
async function enrichCompanies(client, companyKeys) {
  const keys = Object.values(companyKeys);
  if (keys.length === 0) return {};
  const ids = keys.map((k) => k.id).filter(Boolean);
  const fallbackDomains = keys
    .filter((k) => !k.id && k.domain)
    .map((k) => k.domain);
  const fallbackNames = keys
    .filter((k) => !k.id && !k.domain && k.name)
    .map((k) => k.name);

  const results = [];
  try {
    if (ids.length) {
      const r = await client.enrichCompanies({
        crustdataCompanyIds: ids,
        fields: COMPANY_ENRICH_FIELDS,
      });
      if (Array.isArray(r)) results.push(...r);
    }
    if (fallbackDomains.length) {
      const r = await client.enrichCompanies({
        domains: fallbackDomains,
        fields: COMPANY_ENRICH_FIELDS,
      });
      if (Array.isArray(r)) results.push(...r);
    }
    if (fallbackNames.length) {
      const r = await client.enrichCompanies({
        names: fallbackNames,
        fields: COMPANY_ENRICH_FIELDS,
      });
      if (Array.isArray(r)) results.push(...r);
    }
  } catch (e) {
    if (e instanceof CrustdataError) {
      console.warn('enrich_companies failed:', e.message);
    } else {
      throw e;
    }
  }

  const byName = {};
  for (const entry of results) {
    for (const match of entry.matches || []) {
      const cd = match.company_data || {};
      const name =
        dig(cd, ['basic_info', 'name']) ||
        dig(cd, ['basic_info', 'company_name']) ||
        '';
      if (name) byName[name.trim().toLowerCase()] = companySignals(match);
    }
  }
  return byName;
}

// ---------------------------------------------------------------------------
// Top-level orchestrator
// ---------------------------------------------------------------------------

// Returns {prospects: [...], stats: {...}}.
//
// Stats keys are the per-stage counts the agent-reasoning panel renders:
//     companies_matched, candidates_found, profiles_enriched.
export async function runEnrich(filters) {
  const client = new CrustdataClient();

  const companies = await resolveCompanies(client, filters);
  console.log('resolved', companies.length, 'companies');

  const profileUrls = await findPersons(client, filters, companies);
  console.log('found', profileUrls.length, 'person profile urls');

  const personDataList = await enrichPersons(client, profileUrls);
  console.log('enriched', personDataList.length, 'persons');

  const stats = {
    companies_matched: companies.length,
    candidates_found: profileUrls.length,
    profiles_enriched: personDataList.length,
  };

  // Build base prospect rows + the company key set we need to enrich.
  let prospectsRaw = [];
  const companyKeys = {};

  for (const cd of companies) {
    const basics = companyBasics(cd);
    const key = (basics.name || basics.domain || '').trim().toLowerCase();
    if (key && !(key in companyKeys)) {
      companyKeys[key] = {
        id: basics.crustdata_company_id,
        domain: basics.domain,
        name: basics.name,
      };
    }
  }

  for (const pd of personDataList) {
    const basics = personBasics(pd);
    if (!basics.name) continue;
    const key = (basics.company || '').trim().toLowerCase();
    if (key && !(key in companyKeys)) {
      companyKeys[key] = {
        id: basics.crustdata_company_id,
        domain: basics.company_domain,
        name: basics.company,
      };
    } else if (
      key &&
      !companyKeys[key].id &&
      basics.crustdata_company_id
    ) {
      companyKeys[key].id = basics.crustdata_company_id;
      companyKeys[key].domain = companyKeys[key].domain || basics.company_domain;
    }
    prospectsRaw.push({ ...basics });
  }

  // Cap company-name distribution so we don't show 4 people from the same place.
  const capped = [];
  const perCompanyCount = {};
  for (const p of prospectsRaw) {
    const ckey = (p.company || '').trim().toLowerCase();
    if ((perCompanyCount[ckey] || 0) >= MAX_PERSONS_PER_COMPANY) continue;
    perCompanyCount[ckey] = (perCompanyCount[ckey] || 0) + 1;
    capped.push(p);
  }
  prospectsRaw = capped.slice(0, MAX_RESULT_PROSPECTS * 2);

  // Pull company signals + LLM briefings concurrently.
  const companySignalsMap = await enrichCompanies(client, companyKeys);

  const briefingFor = async (p) => {
    const signals =
      companySignalsMap[(p.company || '').trim().toLowerCase()] || {};
    p.companyNews = companyNewsBlurb(signals);
    p.hook = Object.keys(signals).length ? hookFromSignals(signals) : '';
    p.raw_signals = signals;
    let briefing = { painPoint: '', talkingPoints: [] };
    try {
      briefing = await generateBriefing(
        {
          name: p.name,
          title: p.title,
          company: p.company,
          location: p.location,
          recentPost: p.recentPost || '',
        },
        signals,
        filters?.raw || '',
      );
    } catch (e) {
      console.warn('briefing failed for', p.name, ':', e?.message || e);
    }
    p.painPoint = briefing.painPoint || '';
    p.talkingPoints = briefing.talkingPoints || [];
    // Outreach + score happen in their own scaffold steps.
    if (p.recentPost === undefined) p.recentPost = '';
    if (p.emailSubject === undefined) p.emailSubject = '';
    if (p.emailBody === undefined) p.emailBody = '';
    if (p.score === undefined) p.score = 0;
    return p;
  };

  let enriched = await Promise.all(prospectsRaw.map(briefingFor));
  enriched = enriched.slice(0, MAX_RESULT_PROSPECTS);
  return { prospects: enriched, stats };
}

// ---------------------------------------------------------------------------
// Web signals (called by /api/web-signals)
// ---------------------------------------------------------------------------

function formatWebHit(hit) {
  const snippet = hit.snippet || hit.description || hit.text || '';
  const title = hit.title || '';
  const source = hit.source || hit.domain || hit.publisher || '';
  const date = hit.date || hit.published_at || '';
  let quote = (snippet || title || '').trim();
  if (quote.startsWith('"') && quote.endsWith('"')) quote = quote.slice(1, -1);
  if (!quote) return '';
  const suffix = [source, date].filter(Boolean).join(' — ');
  return `\u201c${quote}\u201d${suffix ? ' — ' + suffix : ''}`;
}

// Returns {prospects: [...], stats: {signals_found: N}}.
export async function fetchWebSignals(prospects) {
  const client = new CrustdataClient();

  const one = async (p) => {
    const name = p.name || '';
    const company = p.company || '';
    if (!name || !company) return [p, false];
    const query = `"${name}" "${company}"`;
    let resp;
    try {
      resp = await client.webSearch({ query, limit: 3 });
    } catch (e) {
      if (e instanceof CrustdataError) {
        console.warn('web_search failed for', name, ':', e.message);
        return [p, false];
      }
      throw e;
    }
    const hits = resp?.results || resp?.hits || resp?.items || [];
    if (!hits.length) return [p, false];
    const formatted = formatWebHit(hits[0]);
    let found = false;
    if (formatted) {
      p.recentPost = formatted;
      found = true;
      if (!p.hook) {
        const snippetShort =
          hits[0].title || (hits[0].snippet || '').slice(0, 80);
        if (snippetShort) p.hook = snippetShort;
      }
    }
    return [p, found];
  };

  const results = await Promise.all(prospects.map((p) => one({ ...p })));
  const outProspects = results.map(([p]) => p);
  const signalsFound = results.reduce((acc, [, ok]) => acc + (ok ? 1 : 0), 0);
  return {
    prospects: outProspects,
    stats: { signals_found: signalsFound },
  };
}
