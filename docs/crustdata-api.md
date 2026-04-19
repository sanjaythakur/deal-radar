# Crustdata API Reference
**Source:** https://docs.crustdata.com | **API Version:** 2025-11-01
**Auth header (all requests):** `Authorization: Bearer YOUR_API_KEY` + `x-api-version: 2025-11-01`

---

## 1. Endpoint Cheatsheet

| API | Endpoint | Method | Pricing | Access |
|---|---|---|---|---|
| Company Search | `/company/search` | POST | 0.03 credits/result | Public |
| Company Identify | `/company/identify` | POST | **Free** | Public |
| Company Enrich | `/company/enrich` | POST | 2 credits/record | Public |
| Company Autocomplete | `/company/search/autocomplete` | POST | Free | Public |
| Person Search | `/person/search` | POST | 0.03 credits/result | Public |
| Person Enrich | `/person/enrich` | POST | 1–7 credits/profile* | Public |
| Person Autocomplete | `/person/search/autocomplete` | POST | Free | Public |
| Person Live Search | `/person/live/search` | POST | Enterprise | Book demo |
| Person Live Enrich | `/person/live/enrich` | POST | Enterprise | Book demo |
| Web Search | `/web/search` | POST | TBD | Login required |
| Web Fetch | `/web/fetch` | POST | TBD | Login required |

*Person Enrich credit breakdown: 1 base + 2 personal email + 2 phone + 1 business email + 1 dev platform (max 7)

---

## 2. Company APIs

### 2a. Company Identify — `/company/identify`
> **Use for:** Resolving partial info (name/domain/URL) to a Crustdata company ID. Always run this first — it's free.

**Input identifiers** (send exactly one type per request):

| Field | Type | Example |
|---|---|---|
| `domains` | string[] | `["retool.com"]` |
| `names` | string[] | `["Retool"]` |
| `professional_network_profile_urls` | string[] | `["https://linkedin.com/company/retool"]` |
| `crustdata_company_ids` | integer[] | `[633593]` |
| `exact_match` | boolean | `true` (optional, for strict domain match) |

**Response shape:** Top-level array → `[{ matched_on, match_type, matches: [{ confidence_score, company_data.basic_info }] }]`

**Precision by identifier type:**

| Identifier | Precision | Typical matches |
|---|---|---|
| Domain | High | 1 or more |
| Profile URL | Highest | 1 (exact) |
| Name | Medium | Multiple (check `confidence_score`) |
| Company ID | Highest | 1 (exact) |

---

### 2b. Company Search — `/company/search`
> **Use for:** Building account lists by geography, industry, funding, headcount.

**Request parameters:**

| Param | Type | Required | Notes |
|---|---|---|---|
| `filters` | object | No | Single condition or `and`/`or` group |
| `fields` | string[] | No | Always specify in prod — omitting returns all (huge payload) |
| `sorts` | object[] | No | `[{ "column": "headcount.total", "order": "desc" }]` |
| `limit` | integer | No | Default 20, max 1000 |
| `cursor` | string | No | Pagination token from `next_cursor` |

**Filter operators:**

| Operator | Meaning | Notes |
|---|---|---|
| `=` | Exact match | Case-insensitive for text |
| `!=` | Not equal | |
| `>` / `<` | Numeric/date comparison | |
| `=>` / `=<` | ≥ / ≤ | **NOT** `>=` / `<=` — those are invalid |
| `in` | Value in list | Pass array; case-sensitive |
| `not_in` | Value not in list | |
| `is_null` / `is_not_null` | Null check | No `value` needed |
| `(.)` | Fuzzy/regex match | Tolerates typos |
| `[.]` | Exact token match | No typos; requires exact tokens |

**Key searchable fields:**

| Field | Type | Notes |
|---|---|---|
| `basic_info.primary_domain` | string | |
| `basic_info.name` | string | |
| `basic_info.year_founded` | string | e.g. `"2017"` |
| `basic_info.company_type` | string | `"Privately Held"`, `"Public Company"` |
| `basic_info.employee_count_range` | string | e.g. `"201-500"` |
| `basic_info.industries` | string[] | |
| `taxonomy.professional_network_industry` | string | |
| `locations.hq_country` | string | **ISO3 codes**: `"USA"`, `"IND"`, `"GBR"` |
| `headcount.total` | integer | |
| `funding.total_investment_usd` | number | |
| `funding.last_fundraise_date` | date | |
| `funding.last_round_type` | string | `"series_a"`, `"series_b"` |
| `funding.investors` | string[] | |
| `revenue.estimated.lower_bound_usd` | integer | |
| `hiring.openings_count` | integer | |
| `followers.count` | integer | |

**Response:** `{ companies: [...], next_cursor: "...", total_count: N }`

---

### 2c. Company Enrich — `/company/enrich`
> **Use for:** Getting full company profile after identifying the right record.

Same input identifiers as Identify. Optional: `fields` (section groups) and `exact_match`.

**`fields` parameter — section groups:**

| Section | What it returns |
|---|---|
| `basic_info` | Name, domain, industry, type, year founded |
| `headcount` | Employee count, role/region breakdowns, growth |
| `funding` | Total funding, last round, investors |
| `locations` | HQ country/state/city |
| `taxonomy` | Industry, categories, specialities |
| `revenue` | Estimated revenue bounds, acquisition status |
| `hiring` | Open job count, growth rate, recent titles |
| `followers` | Count, MoM/QoQ/YoY growth |
| `seo` | Organic results, monthly clicks, Google Ads budget |
| `competitors` | Competitor IDs and domains |
| `web_traffic` | Monthly visitors, traffic sources |
| `employee_reviews` | Overall rating, culture, work-life balance |
| `people` | Decision makers, founders, CXOs |
| `news` | Recent article URLs, titles, publish dates |
| `social_profiles` | External profile links |
| `software_reviews` | Review count and average rating |

**Response:** Top-level array → `[{ matched_on, match_type, matches: [{ confidence_score, company_data }] }]`

---

## 3. Person APIs

### 3a. Person Search — `/person/search`
> **Use for:** Finding decision-makers by title, company, location, seniority.

**Request parameters:**

| Param | Type | Required | Notes |
|---|---|---|---|
| `filters` | object | Yes | Condition or `and`/`or` group |
| `fields` | string[] | No | Dot-path fields to return |
| `sorts` | array | No | `[{ "field": "professional_network.connections", "order": "desc" }]` |
| `limit` | integer | No | Default 20, max 1000 |
| `cursor` | string | No | Pagination token |
| `post_processing` | object | No | `{ exclude_names: [...], exclude_profiles: [...] }` |
| `preview` | boolean | No | Premium feature; 400 if not enabled |

**Key filter operators:** Same as Company Search (`=`, `!=`, `in`, `not_in`, `(.)`, `geo_distance`)

**Key searchable fields (use dot-paths in `field` key):**

| Category | Field | Notes |
|---|---|---|
| **Identity** | `basic_profile.name` | |
| | `basic_profile.first_name` / `basic_profile.last_name` | |
| | `basic_profile.headline` | |
| | `basic_profile.summary` | |
| **Location** | `basic_profile.location.city` | |
| | `basic_profile.location.country` | Full name: `"United States"` |
| | `basic_profile.location.full_location` | |
| | `professional_network.location.raw` | Use with `geo_distance` |
| **Current role** | `experience.employment_details.current.title` | |
| | `experience.employment_details.current.company_name` | |
| | `experience.employment_details.current.seniority_level` | |
| | `experience.employment_details.current.function_category` | |
| | `experience.employment_details.current.start_date` | |
| **All roles** | `experience.employment_details.title` | Current + past |
| | `experience.employment_details.company_name` | Current + past |
| | `experience.employment_details.company_headcount_range` | |
| | `experience.employment_details.company_headquarters_country` | |
| **Past role** | `experience.employment_details.past.company_name` | Alumni targeting |
| | `experience.employment_details.past.title` | |
| **Education** | `education.schools.school` | |
| | `education.schools.degree` | |
| | `education.schools.field_of_study` | |
| **Skills** | `skills.professional_network_skills` | |
| **Network** | `professional_network.connections` | |
| **Recency** | `recently_changed_jobs` | Boolean flag |
| | `years_of_experience_raw` | |
| | `metadata.updated_at` | |

**Geo-distance filter shape:**
```json
{
  "field": "professional_network.location.raw",
  "type": "geo_distance",
  "value": { "location": "Bangkok", "distance": 25, "unit": "km" }
}
```

**Sortable fields:** `crustdata_person_id`, `basic_profile.name`, `professional_network.connections`, `experience.employment_details.start_date`, `metadata.updated_at`

**Response:** `{ profiles: [...], next_cursor: "...", total_count: N }`

---

### 3b. Person Enrich — `/person/enrich`
> **Use for:** Getting full profile + contact data for known prospects.

**Input identifiers** (one type per request, max 25 per batch):

| Field | Type | Notes |
|---|---|---|
| `professional_network_profile_urls` | string[] | Direct lookup; always `confidence_score: 1.0` |
| `business_emails` | string[] | Reverse lookup; use `min_similarity_score` |

**Optional parameters:**

| Param | Notes |
|---|---|
| `fields` | Section groups (see below) |
| `min_similarity_score` | 0–1; for email reverse lookup only. 0.8 is balanced |
| `force_fetch` | Advanced flag; requests fresh fetch path |
| `enrich_realtime` | Advanced flag; requests realtime behavior |

**`fields` sections for `person_data`:**

| Section | Key fields |
|---|---|
| `basic_profile` | `name`, `headline`, `current_title`, `summary`, `location`, `languages` |
| `experience` | `employment_details.current[]`, `employment_details.past[]` |
| `education` | `schools[]` |
| `skills` | `professional_network_skills[]` |
| `contact` | `business_emails[]`, `personal_emails[]`, `phone_numbers[]`, `websites[]` |
| `professional_network` | `connections`, `followers`, `profile_picture_permalink` |
| `social_handles` | Available social identifiers |
| `dev_platform_profiles` | GitHub, etc. |

**Credit cost by field:**

| Data | Additional credits |
|---|---|
| Base profile | 1 |
| Business email | +1 |
| Personal email | +2 |
| Phone number | +2 |
| Dev platform | +1 |
| **Max total** | **7** |

**Response:** Top-level array → `[{ matched_on, match_type, matches: [{ confidence_score, person_data }] }]`

---

## 4. Common Footguns

| Mistake | Fix |
|---|---|
| Using `>=` or `<=` in filters | Use `=>` and `=<` |
| Country name `"United States"` in Company Search | Use ISO3 code `"USA"` |
| Country name `"India"` in Company Search | Use `"IND"` |
| `"column"` key in Person Search filters | Use `"field"` |
| `"current_title"` in Person Search filter | Use full path: `experience.employment_details.current.title` |
| Mixing identifier types in one Enrich request | One type per request only |
| Omitting `fields` in Search | Returns all fields — huge payload |
| Using `results` wrapper for Enrich/Identify response | Both return top-level arrays directly |
| Changing `filters` between paginated pages | Invalidates cursor; keep filters identical |

---

## 5. Error Codes

| Code | Meaning | Action |
|---|---|---|
| `400` | Bad request (wrong field, invalid operator, malformed filter) | Fix the request |
| `401` | Invalid/missing API key | Check key |
| `403` | Permission denied or insufficient credits | Check plan/credits |
| `404` | No data found (spec; in practice often returns 200 + empty array) | Handle both |
| `500` | Server error | Retry with exponential backoff: 1s → 2s → 4s |

---

## 6. Workflow Recipes for Deal-Radar

### Recipe A: Build prospect list from natural language query
```
NL query
  → LLM → structured Person Search filters
  → POST /person/search (get profile URLs + basic data)
  → POST /person/enrich (batch up to 25, get contact + full history)
```

### Recipe B: Enrich a company before a person search
```
Company name/domain from query
  → POST /company/identify (free — get crustdata_company_id)
  → POST /company/enrich (get headcount, funding, news, people)
  → POST /person/search filtered by company_name
```

### Recipe C: Hiring-signal intent detection
```
Target company list
  → POST /company/enrich with `hiring` section
  → inspect openings_count, openings_growth_percent, recent_titles_csv
  → flag companies hiring for AI/ML, RevOps, "Direct Channel" roles
```

### Recipe D: Full enrichment pipeline (Deal-Radar core loop)
```
1. POST /company/identify          → resolve company names to IDs (free)
2. POST /person/search             → find decision-makers (0.03/result)
3. POST /person/enrich (batch 25)  → get contact + history (1-7 credits each)
4. POST /company/enrich            → get news + hiring signals (2 credits each)
5. LLM                             → score + generate outreach
```