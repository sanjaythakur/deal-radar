import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_LEAD_STATUS } from '../data/mockCampaigns.js';
import {
  addLeadsToCampaign as apiAddLeads,
  bulkUpdateLeadStatus as apiBulkUpdateStatus,
  createCampaign as apiCreateCampaign,
  deleteLeads as apiDeleteLeads,
  listCampaigns as apiListCampaigns,
  updateLead as apiUpdateLead,
} from '../lib/client/campaigns.js';

// Adapts a Prospect (from the Prospect Finder pipeline) into the lead shape
// the campaign UI expects. Kept identical to the previous client-only logic
// so the UI panels (BriefingCard, OutreachPanel, etc.) keep working.
function adaptProspectToLead(prospect, provenanceContext) {
  const now = new Date().toISOString();
  return {
    ...prospect,
    prospectId: prospect.name,
    name: prospect.name,
    title: prospect.title || '',
    company: prospect.company || '',
    location: prospect.location || '',
    score: typeof prospect.score === 'number' ? prospect.score : 0,
    addedAt: now,
    status: DEFAULT_LEAD_STATUS,
    statusUpdatedAt: now,
    notes: '',
    provenance: {
      addedAt: now,
      query: provenanceContext?.query || null,
      pipelineStats: provenanceContext?.pipelineStats || null,
      totalCandidates: provenanceContext?.totalCandidates ?? null,
      signal: {
        hook: prospect.hook || null,
        companyNews: prospect.companyNews || null,
        recentPost: prospect.recentPost || null,
        painPoint: prospect.painPoint || null,
        talkingPoints: prospect.talkingPoints || null,
        rawSignals: prospect.raw_signals || null,
      },
      ranking: {
        score: typeof prospect.score === 'number' ? prospect.score : null,
      },
    },
  };
}

// Fire-and-log: we apply optimistic updates locally, then push to the API.
// If a write fails we surface it in the console (and on the next mount the
// hook re-fetches from the server and self-heals).
function reportError(label) {
  return (err) => {
    console.error(`[useCampaigns] ${label} failed`, err);
  };
}

export default function useCampaigns() {
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    let cancelled = false;
    apiListCampaigns()
      .then((rows) => {
        if (!cancelled && Array.isArray(rows)) setCampaigns(rows);
      })
      .catch(reportError('list'));
    return () => {
      cancelled = true;
    };
  }, []);

  const createCampaign = useCallback((name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    // Optimistic local insert with a client-generated id so callers (like
    // CampaignAssignment) can immediately reference the new campaign.
    const campaign = {
      id: `camp_${Date.now()}`,
      name: trimmed,
      createdAt: new Date().toISOString(),
      leads: [],
    };
    setCampaigns((prev) => [campaign, ...prev]);
    apiCreateCampaign({ id: campaign.id, name: trimmed })
      .then((persisted) => {
        if (!persisted) return;
        setCampaigns((prev) => prev.map((c) => (c.id === persisted.id ? persisted : c)));
      })
      .catch(reportError('create'));
    return campaign;
  }, []);

  const addLeadsToCampaign = useCallback((campaignId, prospects, provenanceContext) => {
    if (!campaignId || !Array.isArray(prospects) || prospects.length === 0) return;
    let appended = [];
    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id !== campaignId) return c;
        const existing = new Set(c.leads.map((l) => l.prospectId));
        const additions = prospects
          .filter((p) => p && p.name && !existing.has(p.name))
          .map((p) => adaptProspectToLead(p, provenanceContext));
        if (additions.length === 0) return c;
        appended = additions;
        return { ...c, leads: [...c.leads, ...additions] };
      }),
    );
    if (appended.length > 0) {
      apiAddLeads(campaignId, appended)
        .then((persisted) => {
          if (!persisted) return;
          setCampaigns((prev) => prev.map((c) => (c.id === persisted.id ? persisted : c)));
        })
        .catch(reportError('addLeads'));
    }
  }, []);

  const updateLeadStatus = useCallback((campaignId, prospectId, status) => {
    const now = new Date().toISOString();
    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id !== campaignId) return c;
        return {
          ...c,
          leads: c.leads.map((l) =>
            l.prospectId === prospectId ? { ...l, status, statusUpdatedAt: now } : l,
          ),
        };
      }),
    );
    apiUpdateLead(campaignId, prospectId, { status }).catch(reportError('updateStatus'));
  }, []);

  const updateLeadNotes = useCallback((campaignId, prospectId, notes) => {
    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id !== campaignId) return c;
        return {
          ...c,
          leads: c.leads.map((l) => (l.prospectId === prospectId ? { ...l, notes } : l)),
        };
      }),
    );
    apiUpdateLead(campaignId, prospectId, { notes }).catch(reportError('updateNotes'));
  }, []);

  const bulkUpdateStatus = useCallback((campaignId, prospectIds, status) => {
    if (!Array.isArray(prospectIds) || prospectIds.length === 0) return;
    const idSet = new Set(prospectIds);
    const now = new Date().toISOString();
    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id !== campaignId) return c;
        return {
          ...c,
          leads: c.leads.map((l) =>
            idSet.has(l.prospectId) ? { ...l, status, statusUpdatedAt: now } : l,
          ),
        };
      }),
    );
    apiBulkUpdateStatus(campaignId, prospectIds, status).catch(reportError('bulkStatus'));
  }, []);

  const removeLeadsFromCampaign = useCallback((campaignId, prospectIds) => {
    if (!Array.isArray(prospectIds) || prospectIds.length === 0) return;
    const idSet = new Set(prospectIds);
    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id !== campaignId) return c;
        return { ...c, leads: c.leads.filter((l) => !idSet.has(l.prospectId)) };
      }),
    );
    apiDeleteLeads(campaignId, prospectIds).catch(reportError('deleteLeads'));
  }, []);

  return {
    campaigns,
    addLeadsToCampaign,
    createCampaign,
    updateLeadStatus,
    updateLeadNotes,
    bulkUpdateStatus,
    removeLeadsFromCampaign,
  };
}
