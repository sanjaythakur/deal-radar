// Thin client for the FastAPI /api/campaigns endpoints.
// All writes are best-effort: callers (see useCampaigns) apply the change
// optimistically to local state and use the server response purely as a
// consistency check.

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text().catch(() => '');
    }
    const msg = typeof detail === 'string' ? detail : detail?.detail || JSON.stringify(detail);
    const err = new Error(`${method} ${path} failed (${res.status}): ${msg}`);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export function listCampaigns() {
  return request('/api/campaigns');
}

export function createCampaign({ id, name }) {
  return request('/api/campaigns', { method: 'POST', body: { id, name } });
}

export function addLeadsToCampaign(campaignId, leads) {
  return request(`/api/campaigns/${encodeURIComponent(campaignId)}/leads`, {
    method: 'POST',
    body: { leads },
  });
}

export function updateLead(campaignId, prospectId, patch) {
  return request(
    `/api/campaigns/${encodeURIComponent(campaignId)}/leads/${encodeURIComponent(prospectId)}`,
    { method: 'PATCH', body: patch },
  );
}

export function bulkUpdateLeadStatus(campaignId, prospectIds, status) {
  return request(`/api/campaigns/${encodeURIComponent(campaignId)}/leads/bulk-status`, {
    method: 'POST',
    body: { prospectIds, status },
  });
}

export function deleteLeads(campaignId, prospectIds) {
  return request(`/api/campaigns/${encodeURIComponent(campaignId)}/leads/delete`, {
    method: 'POST',
    body: { prospectIds },
  });
}
