# Crustdata API Reference (Deal-Radar working notes)
**Source of truth:** https://docs.crustdata.com — but verified empirically against the live API on 2026-04-19. **The published docs are partially wrong**; corrections are flagged inline with ⚠ and consolidated in §6.

**Auth (all requests):** `Authorization: Bearer YOUR_API_KEY` + `x-api-version: 2025-11-01`

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
| **Web Search** | **`/screener/web-search`** ⚠ | POST | TBD | Public (key required) |

⚠ The docs reference `/web/search`. That path returns `404`. The real endpoint is `/screener/web-search`.

*Person Enrich credit breakdown: 1 base + 2 personal email + 2 phone + 1 business email + 1 dev platform (max 7).

---

## 2. Filter / sort schema (read this first — it's the most footgun-prone area)

### 2a. Filter shape (both `/company/search` and `/person/search`)

**Leaf condition:**
```json
{ "field": "<dot.path>", "type": "<operator>", "value": <...> }
```
The operator goes in `type`, not `op`. ⚠ Several places in the public docs say `op`; the live API rejects that as malformed.

**Group:**
```json
{ "op": "and" | "or", "conditions": [ <leaf-or-group>, ... ] }
```
`op` is reserved for groups (only `and` / `or`). Leaves never use `op`.

A bare leaf object as the top-level `filters` works in some endpoints but is fragile — wrap everything in an `and` group for reliability.

### 2b. Sort shape — **inconsistent across endpoints** ⚠

| Endpoint | Sort key |
|---|---|
| `/company/search` | `{ "column": "<dot.path>", "order": "asc" \| "desc" }` |
| `/person/search`  | `{ "field":  "<dot.path>", "order": "asc" \| "desc" }` |

The two endpoints disagree. Use `column` for company, `field` for person.

### 2c. Operator reference

| Operator | Meaning | Notes |
|---|---|---|
| `=` | Exact match | Case-insensitive for text |
| `!=` | Not equal | |
| `>` / `<` | Numeric/date comparison | |
| `=>` / `=<` | ≥ / ≤ | **NOT** `>=` / `<=` — those are invalid |
| `in` | Value in list | Pass array; case-sensitive |
| `not_in` | Value not in list | |
| `is_null` / `is_not_null` | Null check | No `value` needed |
| `(.)` | Fuzzy/regex contains | Pipes are OR (`"VP\|Director"`). ⚠ See pitfalls below. |
| `[.]` | Exact token match | No typos; requires exact tokens |
| `geo_distance` | Within radius | Person search only; value is `{location, distance, unit}` |

**`(.)` regex pitfalls (verified empirically):**

1. **Two `(.)` conditions on the same person field returns 0 results.** E.g. `current.title (.) "Revenue"` AND `current.title (.) "VP|Director|Head"` returns `[]` even when each individually returns hundreds of profiles. Use `current.seniority_level in [...]` for the seniority half and a single `(.)` for the noun half.
2. **Long pipe-alternation phrases match poorly.** `current.title (.) "VP Revenue|Vice President Revenue|Head of Revenue"` returns 0; `current.title (.) "Revenue"` returns 520+ on the same data set. Keep regex short and high-recall; narrow with seniority/company filters instead.

---

## 3. Company APIs

### 3a. Company Identify — `/company/identify`
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

| Identifier | Precision | Typical matches |
|---|---|---|
| Domain | High | 1 or more |
| Profile URL | Highest | 1 (exact) |
| Name | Medium | Multiple (check `confidence_score`) |
| Company ID | Highest | 1 (exact) |

---

### 3b. Company Search — `/company/search`
> **Use for:** Building account lists by geography, industry, funding, headcount.

**Request parameters:**

| Param | Type | Required | Notes |
|---|---|---|---|
| `filters` | object | No | Single condition or `and`/`or` group |
| `fields` | string[] | No | Always specify in prod — omitting returns all (huge payload) |
| `sorts` | object[] | No | `[{ "column": "headcount.total", "order": "desc" }]` (uses `column`) |
| `limit` | integer | No | Default 20, max 1000 |
| `cursor` | string | No | Pagination token from `next_cursor` |

**Always request `crustdata_company_id` explicitly** in `fields` — it's needed for ID-based enrich and is **not** included by default even when you ask for the `basic_info` section.

**Key searchable fields:**

| Field | Type | Notes |
|---|---|---|
| `crustdata_company_id` | integer | Stable id; request explicitly |
| `basic_info.primary_domain` | string | |
| `basic_info.name` | string | |
| `basic_info.year_founded` | string | e.g. `"2017"` |
| `basic_info.company_type` | string | `"Privately Held"`, `"Public Company"` |
| `basic_info.employee_count_range` | string | e.g. `"201-500"` |
| `basic_info.industries` | string[] | Use Autocomplete to discover canonical labels |
| `taxonomy.professional_network_industry` | string | |
| **`locations.country`** ⚠ | string | **ISO3** (`"USA"`, `"SGP"`). This is the real HQ-country filter. |
| ~~`locations.hq_country`~~ | — | ⚠ **Unsupported as a filter** despite being listed in the public docs and being a valid *response* field. Returns `400 Unsupported columns in conditions`. |
| `locations.headquarters` | string | Free-text HQ string; matches with `(.)` are sparse — prefer `locations.country` |
| `headcount.total` | integer | Sortable |
| `funding.total_investment_usd` | number | |
| `funding.last_fundraise_date` | date | |
| `funding.last_round_type` | string | `"series_a"`, `"series_b"` |
| `funding.investors` | string[] | |
| `revenue.estimated.lower_bound_usd` | integer | |
| `hiring.openings_count` | integer | |
| `followers.count` | integer | Sortable |

**Response:** `{ companies: [...], next_cursor: "...", total_count: N }` (`total_count` may be `null` for broad queries.)

**Returned location shape (when `locations.country` / `locations.city` requested):**
```json
{ "locations": { "country": "SGP", "state": null, "city": null } }
```
⚠ The response uses `country` / `city`, not `hq_country` / `hq_city`.

---

### 3c. Company Enrich — `/company/enrich`
> **Use for:** Getting full company profile after identifying the right record.

Same input identifiers as Identify. Optional: `fields` (section groups) and `exact_match`.

⚠ **Domain-based enrich is fuzzy and frequently returns the wrong sub-brand.** Examples observed in the wild:
- `domains: ["accor.com"]` → returned `"Sofitel Riyadh Hotel & Convention Centre"`.
- `domains: ["marriott.com"]` → returned `"Courtyard by Marriott"`.

**Always prefer `crustdata_company_ids` for enrich** (request it explicitly from the search response). Fall back to `domains` only when no id is available.

**`fields` parameter — section groups:**

| Section | What it returns |
|---|---|
| `basic_info` | Name, domain, industry, type, year founded, `crustdata_company_id` |
| `headcount` | Employee count, role/region breakdowns, growth |
| `funding` | Total funding, last round, investors |
| `locations` | Country, state, city |
| `taxonomy` | Industry, categories, specialities |
| `revenue` | Estimated revenue bounds, acquisition status |
| `hiring` | `openings_count`, `openings_growth_percent.{mom,qoq,yoy}`, `recent_titles_csv`, `by_function_qoq_pct`, `open_jobs_timeseries[]` |
| `followers` | Count, MoM/QoQ/YoY growth |
| `news` | Recent articles (see shape below) |
| `competitors` | Competitor IDs and domains |
| `web_traffic` | Monthly visitors, traffic sources |
| `seo` | Organic results, monthly clicks, Google Ads budget |
| `employee_reviews` | Overall rating, culture, work-life balance |
| `social_profiles` | External profile links |
| `software_reviews` | Review count and average rating |

**News entry shape (verified):** ⚠
```json
{
  "article_title":          "Sofitel's Saudi Arabia expansion strategy",
  "article_publisher_name": "Hotelier Middle East",
  "article_publish_date":   "2025-08-05",
  "article_url":            "https://...",
  "publisher_domain":       "hoteliermiddleeast.com",
  "source":                 "google_news",
  "confidence_score":       1.0
}
```
⚠ The keys are `article_*`, **not** `title` / `publisher` / `publish_date` / `url` as several doc summaries suggest.

**Response:** Top-level array → `[{ matched_on, match_type, matches: [{ confidence_score, company_data }] }]`

---

## 4. Person APIs

### 4a. Person Search — `/person/search`
> **Use for:** Finding decision-makers by title, company, location, seniority.

**Request parameters:**

| Param | Type | Required | Notes |
|---|---|---|---|
| `filters` | object | Yes | Condition or `and`/`or` group |
| `fields` | string[] | No | Dot-path fields to return |
| `sorts` | array | No | `[{ "field": "metadata.updated_at", "order": "desc" }]` (uses `field`) |
| `limit` | integer | No | Default 20, max 1000 |
| `cursor` | string | No | Pagination token |
| `post_processing` | object | No | `{ exclude_names: [...], exclude_profiles: [...] }` |
| `preview` | boolean | No | Premium feature; 400 if not enabled |

**Sortable person fields:** `crustdata_person_id`, `basic_profile.name`, `professional_network.connections`, `experience.employment_details.start_date`, `metadata.updated_at`.

**Key searchable fields (use dot-paths in the `field` key):**

| Category | Field | Notes |
|---|---|---|
| **Identity** | `basic_profile.name` | |
| | `basic_profile.first_name` / `basic_profile.last_name` | |
| | `basic_profile.headline` / `basic_profile.summary` | |
| **Location** | `basic_profile.location.city` | |
| | `basic_profile.location.country` | Full name: `"United States"` (not ISO3 like company search uses) |
| | `basic_profile.location.continent` | |
| | `basic_profile.location.full_location` | |
| | `professional_network.location.raw` | Use with `geo_distance` |
| **Current role** | `experience.employment_details.current.title` | |
| | `experience.employment_details.current.company_name` | |
| | `experience.employment_details.current.seniority_level` | enum — see below |
| | `experience.employment_details.current.function_category` | |
| | `experience.employment_details.current.start_date` | |
| **All roles** | `experience.employment_details.title` | Current + past, multi-element |
| | `experience.employment_details.company_name` | Current + past |
| | `experience.employment_details.company_headcount_range` | |
| | `experience.employment_details.company_headquarters_country` | ISO3 — useful for "people working at companies HQ'd in X" |
| **Past role** | `experience.employment_details.past.company_name` | Alumni targeting |
| | `experience.employment_details.past.title` | |
| **Education** | `education.schools.school` / `.degree` / `.field_of_study` | |
| **Skills** | `skills.professional_network_skills` | |
| **Network** | `professional_network.connections` | |
| **Recency** | `recently_changed_jobs` | Boolean |
| | `years_of_experience_raw` / `metadata.updated_at` | |

**`current.seniority_level` enum (verified via autocomplete):** ⚠
```
Entry Level, Entry Level Manager, Senior, Director, Owner / Partner,
CXO, In Training, Vice President, Experienced Manager, Strategic
```
⚠ Note these are full names. Common mistakes that return 0:
- ❌ `"VP"` → use `"Vice President"`
- ❌ `"C-Level"` → use `"CXO"`

**Geo-distance filter shape:**
```json
{
  "field": "professional_network.location.raw",
  "type":  "geo_distance",
  "value": { "location": "Bangkok", "distance": 25, "unit": "km" }
}
```

**Response:** `{ profiles: [...], next_cursor: "...", total_count: N }`

**Returned profile URL location:** `social_handles.professional_network_identifier.profile_url` (this is what you pass to `/person/enrich`). It is **not** filterable in `/person/search`, only returnable.

---

### 4b. Person Enrich — `/person/enrich`
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
| `basic_profile` | `name`, `first_name`, `last_name`, `headline`, `current_title`, `summary`, `location`, `languages`, `profile_picture_permalink`, `last_updated` |
| `experience` | `employment_details.current[]`, `employment_details.past[]` |
| `education` | `schools[]` |
| `skills` | `professional_network_skills[]` |
| `contact` | `business_emails[]`, `personal_emails[]`, `phone_numbers[]`, `websites[]` |
| `professional_network` | `connections`, `followers`, `profile_picture_permalink` |
| `social_handles` | `professional_network_identifier.profile_url`, etc. |

**`employment_details.current[]` item shape (verified):** ⚠
```json
{
  "name":                                     "Minor Hotels",
  "title":                                    "Area Director of Revenue Management - Maldives, SriLanka and India",
  "crustdata_company_id":                     1051021,
  "company_website_domain":                   "minorhotels.com",
  "company_professional_network_profile_url": "https://linkedin.com/company/3216415",
  "company_headquarters_country":             null,
  "company_industries":                       null,
  "company_headcount_range":                  null,
  "company_type":                             null,
  "start_date":                               "2025-06-01T00:00:00+00:00",
  "is_default":                               false,
  "location":                                 { "raw": "" },
  "business_email_verified":                  null
}
```
⚠ Two key surprises:
1. The company name lives in `current[i].name`, **not** `current[i].company_name`.
2. Each entry exposes its own `crustdata_company_id` and `company_website_domain` — use these to enrich the company reliably (instead of fuzzy domain enrich).

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

## 5. Web Search — `/screener/web-search`

> **Use for:** Looking up recent posts, news mentions, or any web context for a prospect.

**Request:**
```json
{ "query": "\"Stephen Black\" \"Marriott\"", "limit": 3 }
```

**Response:**
```json
{
  "success":   true,
  "query":     "...",
  "timestamp": 1776582177516,
  "results": [
    {
      "source":   "web",
      "title":    "Stephen Black - Sr. Virtual Sales Executive @ Marriott...",
      "url":      "https://www.linkedin.com/in/stblack",
      "snippet":  "...",
      "position": 1
    }
  ]
}
```

⚠ Quoting the query (e.g. `"\"Name\" \"Company\""`) materially improves precision. Without quotes you'll get ranking-style noise.

⚠ The `source` field is always `"web"` for this endpoint — there's no per-result publisher. Derive a display source from the URL hostname if needed.

---

## 6. Doc-vs-reality cheat-sheet (start here when something 400s)

| What the public docs say | What the live API actually does |
|---|---|
| Company-search country filter `locations.hq_country` | ⚠ Returns `400 Unsupported columns`. Use **`locations.country`** with ISO3. |
| Sort key is `column` everywhere | ⚠ `/company/search` uses `column`; `/person/search` uses `field`. |
| Filter operator key is `op` (in some examples) | ⚠ Operator goes in `type`. `op` is only for `and`/`or` groups. |
| `(.)` regex with pipes works on any field | ⚠ Two `(.)` conditions on the same person field returns 0; long pipe phrases on `current.title` rarely match. Pair with `current.seniority_level in [...]`. |
| Seniority filter values include `"VP"`, `"C-Level"` | ⚠ Real enum is `Vice President`, `CXO`, `Director`, `Owner / Partner`, `Senior`, `Experienced Manager`, `Strategic`, `Entry Level Manager`, `Entry Level`, `In Training`. |
| Web Search at `/web/search` | ⚠ 404. Real path is `/screener/web-search`. |
| News entries use `title` / `publisher` / `date` / `url` | ⚠ Real keys: `article_title`, `article_publisher_name`, `article_publish_date`, `article_url`. |
| Person `current[i].company_name` | ⚠ The enrich payload uses `current[i].name` (with `crustdata_company_id` + `company_website_domain` siblings). |
| Company response uses `locations.hq_country` / `hq_city` | ⚠ Response uses `locations.country` / `locations.city`. |
| Company enrich by domain returns the company you asked for | ⚠ Often returns a sub-brand (e.g. `accor.com` → "Sofitel Riyadh"). Enrich by `crustdata_company_id` instead. |
| `crustdata_company_id` is included with `basic_info` section | ⚠ Must be requested **explicitly** in `fields` for `/company/search`. |

---

## 7. Common Footguns

| Mistake | Fix |
|---|---|
| Using `>=` or `<=` in filters | Use `=>` and `=<` |
| Country name `"United States"` in Company Search | Use ISO3 `"USA"` on `locations.country` |
| `locations.hq_country` filter | Use `locations.country` (see §6) |
| `column` in person-search sort | Use `field` |
| `field` in company-search sort | Use `column` |
| `op` on a leaf condition | Use `type`. `op` is for groups only. |
| `current_title` shorthand | Use full path: `experience.employment_details.current.title` |
| Mixing identifier types in one Enrich request | One type per request only |
| Omitting `fields` in Search | Returns all fields — huge payload; also hides `crustdata_company_id` |
| Two `(.)` conditions on the same person field | Combine `seniority_level in [...]` + one short `(.)` keyword |
| Enriching companies by `domains` and matching responses by name | Match by `crustdata_company_id` instead |
| Reading `news[i].title` | It's `news[i].article_title` |

---

## 8. Error Codes

| Code | Meaning | Action |
|---|---|---|
| `400` | Bad request (wrong field, invalid operator, malformed filter) | Fix the request |
| `401` | Invalid/missing API key | Check key |
| `403` | Permission denied or insufficient credits | Check plan/credits |
| `404` | No data found (spec; in practice often returns 200 + empty array) | Handle both |
| `500` | Server error | Retry with exponential backoff: 1s → 2s → 4s |

---

## 9. Workflow Recipes for Deal-Radar

### Recipe A: Build prospect list from natural language query
```
NL query
  → LLM → { title_keyword, seniority_levels[], industries[], countries_iso3[] }
  → POST /company/search (industries + locations.country in countries_iso3)
  → POST /person/search  (current.seniority_level in [...] + current.title (.) <keyword>
                          + current.company_name in <company list from step 1>)
  → POST /person/enrich  (batch up to 25 — use returned profile URLs)
```

### Recipe B: Enrich a company before a person search
```
Company name/domain from query
  → POST /company/identify (free — get crustdata_company_id)
  → POST /company/enrich   (BY ID — get headcount, funding, news, hiring)
  → POST /person/search    filtered by current.company_name
```

### Recipe C: Hiring-signal intent detection
```
Target company list (with crustdata_company_ids)
  → POST /company/enrich with `hiring` section
  → inspect openings_count, openings_growth_percent, recent_titles_csv
  → flag companies hiring for AI/ML, RevOps, "Direct Channel" roles
```

### Recipe D: Full enrichment pipeline (Deal-Radar core loop — verified working)
```
1. POST /company/search            → resolve target accounts
                                     (locations.country in ISO3, basic_info.industries in [...],
                                      always request "crustdata_company_id" in fields)
2. POST /person/search              → find decision-makers
                                     (current.seniority_level in [Vice President, Director, CXO]
                                      + current.title (.) <single keyword like "Revenue">
                                      + current.company_name in <company names from step 1>)
3. POST /person/enrich (batch 25)   → contact + history
                                     (extract current[0].crustdata_company_id /
                                      .company_website_domain for every prospect)
4. POST /company/enrich BY ID       → news + hiring + funding
                                     (use the ids gathered in step 3 for reliability)
5. POST /screener/web-search        → recent web mentions per prospect ("\"Name\" \"Company\"")
6. LLM                              → score + briefing + outreach
```
