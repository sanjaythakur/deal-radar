// Async client for Crustdata REST endpoints.
//
// Covers the subset Deal-Radar needs:
// - /company/identify   (free company resolution)
// - /company/search     (build account lists)
// - /company/enrich     (news, hiring, funding sections)
// - /person/search      (decision-maker discovery)
// - /person/enrich      (profile + contact, batch up to 25)
// - /screener/web-search (recent web mentions per prospect)
//
// All requests send the standard auth + version headers.

const BASE_URL = 'https://api.crustdata.com';
const API_VERSION = '2025-11-01';
const DEFAULT_TIMEOUT_MS = 30_000;

export class CrustdataError extends Error {
  constructor(status, body) {
    super(`Crustdata ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    this.name = 'CrustdataError';
    this.status = status;
    this.body = body;
  }
}

export class CrustdataClient {
  constructor({ apiKey, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.apiKey = apiKey || process.env.CRUSTDATA_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('CRUSTDATA_API_KEY is not set');
    }
    this.timeoutMs = timeoutMs;
  }

  async _post(path, payload) {
    const url = `${BASE_URL}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'x-api-version': API_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      throw new CrustdataError(0, e?.message || String(e));
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 400) {
      let body;
      try {
        body = await res.json();
      } catch {
        body = await res.text().catch(() => '');
      }
      throw new CrustdataError(res.status, body);
    }
    return res.json();
  }

  // --- company ---------------------------------------------------------

  async identifyCompanies({
    names,
    domains,
    profileUrls,
    crustdataCompanyIds,
    exactMatch = false,
  } = {}) {
    const payload = {};
    if (names && names.length) payload.names = names;
    if (domains && domains.length) payload.domains = domains;
    if (profileUrls && profileUrls.length)
      payload.professional_network_profile_urls = profileUrls;
    if (crustdataCompanyIds && crustdataCompanyIds.length)
      payload.crustdata_company_ids = crustdataCompanyIds;
    if (exactMatch) payload.exact_match = true;
    if (Object.keys(payload).length === 0) return [];
    return this._post('/company/identify', payload);
  }

  async searchCompanies({ filters, fields, sorts, limit = 20 } = {}) {
    const payload = { filters, limit };
    if (fields) payload.fields = fields;
    if (sorts) payload.sorts = sorts;
    return this._post('/company/search', payload);
  }

  async enrichCompanies({
    crustdataCompanyIds,
    domains,
    names,
    fields,
  } = {}) {
    const payload = {};
    if (crustdataCompanyIds && crustdataCompanyIds.length) {
      payload.crustdata_company_ids = crustdataCompanyIds;
    } else if (domains && domains.length) {
      payload.domains = domains;
    } else if (names && names.length) {
      payload.names = names;
    } else {
      return [];
    }
    if (fields) payload.fields = fields;
    return this._post('/company/enrich', payload);
  }

  // --- person ----------------------------------------------------------

  async searchPersons({ filters, fields, sorts, limit = 20 } = {}) {
    const payload = { filters, limit };
    if (fields) payload.fields = fields;
    if (sorts) payload.sorts = sorts;
    return this._post('/person/search', payload);
  }

  async enrichPersons({
    profileUrls,
    businessEmails,
    fields,
    minSimilarityScore,
  } = {}) {
    const payload = {};
    if (profileUrls && profileUrls.length) {
      // API caps at 25 per request — caller batches.
      payload.professional_network_profile_urls = profileUrls.slice(0, 25);
    } else if (businessEmails && businessEmails.length) {
      payload.business_emails = businessEmails.slice(0, 25);
      if (minSimilarityScore !== undefined && minSimilarityScore !== null) {
        payload.min_similarity_score = minSimilarityScore;
      }
    } else {
      return [];
    }
    if (fields) payload.fields = fields;
    return this._post('/person/enrich', payload);
  }

  // --- web -------------------------------------------------------------

  async webSearch({ query, limit = 5 } = {}) {
    // NOTE: live endpoint is /screener/web-search (the /web/search path
    // listed elsewhere returns 404).
    return this._post('/screener/web-search', { query, limit });
  }
}
