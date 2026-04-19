// Campaign persistence. Mirrors the FastAPI version in backend/campaigns.py:
// the frontend builds rich lead payloads (see hooks/useCampaigns.js
// adaptProspectToLead) and we treat each lead as an opaque object,
// only enforcing the small set of fields we actually mutate server-side:
// `prospectId`, `status`, `statusUpdatedAt`, `notes`.

import crypto from 'node:crypto';
import { query } from './db.js';

export const DEFAULT_LEAD_STATUS = 'Not Started';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function toDict(row) {
  let createdAt = row.created_at;
  if (createdAt instanceof Date) createdAt = createdAt.toISOString();
  else if (createdAt != null) createdAt = String(createdAt);
  return {
    id: row.id,
    name: row.name,
    createdAt: createdAt,
    leads: Array.isArray(row.leads) ? row.leads : (row.leads || []),
  };
}

function normalizeLead(lead) {
  if (!lead || typeof lead !== 'object') return null;
  const prospectId = lead.prospectId || lead.name;
  if (!prospectId) return null;
  const out = { ...lead };
  out.prospectId = prospectId;
  if (out.status === undefined) out.status = DEFAULT_LEAD_STATUS;
  if (out.statusUpdatedAt === undefined) out.statusUpdatedAt = nowIso();
  if (out.addedAt === undefined) out.addedAt = nowIso();
  if (out.notes === undefined) out.notes = '';
  return out;
}

async function getOr404(campaignId) {
  const { rows } = await query(
    'SELECT id, name, created_at, leads FROM campaigns WHERE id = $1',
    [campaignId],
  );
  if (rows.length === 0) {
    throw new HttpError(404, `campaign ${campaignId} not found`);
  }
  return rows[0];
}

export async function listCampaigns() {
  const { rows } = await query(
    'SELECT id, name, created_at, leads FROM campaigns ORDER BY created_at DESC',
  );
  return rows.map(toDict);
}

export async function createCampaign({ id, name }) {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    throw new HttpError(400, 'name is required');
  }
  const campaignId = id || `camp_${crypto.randomBytes(6).toString('hex')}`;

  // Idempotent: if the FE retries an optimistic create, just return what we
  // already have.
  const existing = await query(
    'SELECT id, name, created_at, leads FROM campaigns WHERE id = $1',
    [campaignId],
  );
  if (existing.rows.length) return toDict(existing.rows[0]);

  const { rows } = await query(
    `INSERT INTO campaigns (id, name, leads) VALUES ($1, $2, '[]'::jsonb)
     RETURNING id, name, created_at, leads`,
    [campaignId, trimmed],
  );
  return toDict(rows[0]);
}

export async function addLeads(campaignId, leadsInput) {
  const row = await getOr404(campaignId);
  const existingLeads = Array.isArray(row.leads) ? row.leads : (row.leads || []);
  const existingIds = new Set(existingLeads.map((l) => l?.prospectId));
  const additions = [];
  for (const lead of leadsInput || []) {
    const normalized = normalizeLead(lead);
    if (normalized === null) continue;
    if (existingIds.has(normalized.prospectId)) continue;
    additions.push(normalized);
    existingIds.add(normalized.prospectId);
  }
  if (additions.length === 0) {
    return toDict(row);
  }
  const newLeads = [...existingLeads, ...additions];
  const { rows } = await query(
    `UPDATE campaigns SET leads = $1::jsonb WHERE id = $2
     RETURNING id, name, created_at, leads`,
    [JSON.stringify(newLeads), campaignId],
  );
  return toDict(rows[0]);
}

export async function updateLead(campaignId, prospectId, patch) {
  const row = await getOr404(campaignId);
  const leads = Array.isArray(row.leads) ? [...row.leads] : [];
  let changed = false;
  for (const lead of leads) {
    if (lead?.prospectId !== prospectId) continue;
    if (patch?.status !== undefined && patch.status !== null) {
      lead.status = patch.status;
      lead.statusUpdatedAt = nowIso();
      changed = true;
    }
    if (patch?.notes !== undefined && patch.notes !== null) {
      lead.notes = patch.notes;
      changed = true;
    }
  }
  if (!changed) return toDict(row);
  const { rows } = await query(
    `UPDATE campaigns SET leads = $1::jsonb WHERE id = $2
     RETURNING id, name, created_at, leads`,
    [JSON.stringify(leads), campaignId],
  );
  return toDict(rows[0]);
}

export async function bulkStatus(campaignId, prospectIds, status) {
  const row = await getOr404(campaignId);
  const targetIds = new Set(prospectIds || []);
  if (targetIds.size === 0) return toDict(row);
  const now = nowIso();
  const leads = Array.isArray(row.leads) ? [...row.leads] : [];
  for (const lead of leads) {
    if (targetIds.has(lead?.prospectId)) {
      lead.status = status;
      lead.statusUpdatedAt = now;
    }
  }
  const { rows } = await query(
    `UPDATE campaigns SET leads = $1::jsonb WHERE id = $2
     RETURNING id, name, created_at, leads`,
    [JSON.stringify(leads), campaignId],
  );
  return toDict(rows[0]);
}

export async function deleteLeads(campaignId, prospectIds) {
  const row = await getOr404(campaignId);
  const targetIds = new Set(prospectIds || []);
  if (targetIds.size === 0) return toDict(row);
  const leads = (Array.isArray(row.leads) ? row.leads : []).filter(
    (l) => !targetIds.has(l?.prospectId),
  );
  const { rows } = await query(
    `UPDATE campaigns SET leads = $1::jsonb WHERE id = $2
     RETURNING id, name, created_at, leads`,
    [JSON.stringify(leads), campaignId],
  );
  return toDict(rows[0]);
}
