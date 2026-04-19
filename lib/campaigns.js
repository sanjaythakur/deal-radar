// In-memory campaign persistence. State lives in module-level globals for the
// lifetime of the Node process — restarting the server (or a Coolify redeploy)
// resets back to the seed list. This intentionally trades durability for
// zero-infra deployment; swap in a real DB later if needed.
//
// The frontend builds rich lead payloads (see hooks/useCampaigns.js
// adaptProspectToLead) and we treat each lead as an opaque object,
// only enforcing the small set of fields we actually mutate server-side:
// `prospectId`, `status`, `statusUpdatedAt`, `notes`.

import crypto from 'node:crypto';

export const DEFAULT_LEAD_STATUS = 'Not Started';

// Mirrors data/mockCampaigns.js — kept in sync intentionally.
const SEED_CAMPAIGNS = [
  { id: 'camp_001', name: 'SEA Hotel Outreach Q2' },
  { id: 'camp_002', name: 'Corporate TMC AI Signal' },
  { id: 'camp_003', name: 'APAC Loyalty Partnerships' },
];

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

// --- store ------------------------------------------------------------------
//
// Hang the store off `globalThis` so Next.js dev-mode hot reload doesn't wipe
// it on every request — module instances are recreated, but globals survive.

function store() {
  if (!globalThis.__dealRadarCampaigns) {
    const map = new Map();
    const created = nowIso();
    for (const seed of SEED_CAMPAIGNS) {
      map.set(seed.id, {
        id: seed.id,
        name: seed.name,
        createdAt: created,
        leads: [],
      });
    }
    globalThis.__dealRadarCampaigns = map;
  }
  return globalThis.__dealRadarCampaigns;
}

function clone(campaign) {
  return {
    id: campaign.id,
    name: campaign.name,
    createdAt: campaign.createdAt,
    leads: campaign.leads.map((l) => ({ ...l })),
  };
}

function getOr404(campaignId) {
  const c = store().get(campaignId);
  if (!c) throw new HttpError(404, `campaign ${campaignId} not found`);
  return c;
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

// --- API --------------------------------------------------------------------

export async function listCampaigns() {
  // Newest-first to match the FastAPI version's ORDER BY created_at DESC.
  const all = [...store().values()];
  all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return all.map(clone);
}

export async function createCampaign({ id, name }) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new HttpError(400, 'name is required');
  const campaignId = id || `camp_${crypto.randomBytes(6).toString('hex')}`;

  const map = store();
  const existing = map.get(campaignId);
  if (existing) {
    // Idempotent: if the FE retries an optimistic create, just return what we
    // already have.
    return clone(existing);
  }
  const campaign = {
    id: campaignId,
    name: trimmed,
    createdAt: nowIso(),
    leads: [],
  };
  map.set(campaignId, campaign);
  return clone(campaign);
}

export async function addLeads(campaignId, leadsInput) {
  const campaign = getOr404(campaignId);
  const existingIds = new Set(campaign.leads.map((l) => l?.prospectId));
  const additions = [];
  for (const lead of leadsInput || []) {
    const normalized = normalizeLead(lead);
    if (normalized === null) continue;
    if (existingIds.has(normalized.prospectId)) continue;
    additions.push(normalized);
    existingIds.add(normalized.prospectId);
  }
  if (additions.length) {
    campaign.leads = [...campaign.leads, ...additions];
  }
  return clone(campaign);
}

export async function updateLead(campaignId, prospectId, patch) {
  const campaign = getOr404(campaignId);
  let changed = false;
  campaign.leads = campaign.leads.map((lead) => {
    if (lead?.prospectId !== prospectId) return lead;
    const next = { ...lead };
    if (patch?.status !== undefined && patch.status !== null) {
      next.status = patch.status;
      next.statusUpdatedAt = nowIso();
      changed = true;
    }
    if (patch?.notes !== undefined && patch.notes !== null) {
      next.notes = patch.notes;
      changed = true;
    }
    return next;
  });
  if (!changed) return clone(campaign);
  return clone(campaign);
}

export async function bulkStatus(campaignId, prospectIds, status) {
  const campaign = getOr404(campaignId);
  const targetIds = new Set(prospectIds || []);
  if (targetIds.size === 0) return clone(campaign);
  const now = nowIso();
  campaign.leads = campaign.leads.map((lead) => {
    if (!targetIds.has(lead?.prospectId)) return lead;
    return { ...lead, status, statusUpdatedAt: now };
  });
  return clone(campaign);
}

export async function deleteLeads(campaignId, prospectIds) {
  const campaign = getOr404(campaignId);
  const targetIds = new Set(prospectIds || []);
  if (targetIds.size === 0) return clone(campaign);
  campaign.leads = campaign.leads.filter((l) => !targetIds.has(l?.prospectId));
  return clone(campaign);
}
