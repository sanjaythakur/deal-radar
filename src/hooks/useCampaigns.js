import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_LEAD_STATUS, MOCK_CAMPAIGNS } from '../data/mockCampaigns.js';

const STORAGE_KEY = 'deal-radar:campaigns';

function loadInitial() {
  if (typeof window === 'undefined') return MOCK_CAMPAIGNS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return MOCK_CAMPAIGNS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return MOCK_CAMPAIGNS;
    return parsed;
  } catch {
    return MOCK_CAMPAIGNS;
  }
}

function adaptProspectToLead(prospect, provenanceContext) {
  const now = new Date().toISOString();
  // Preserve the full prospect payload so the campaign view can render the
  // same Briefing + Outreach panels the Prospect Finder uses.
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

export default function useCampaigns() {
  const [campaigns, setCampaigns] = useState(loadInitial);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(campaigns));
    } catch {
      // ignore quota / privacy mode errors
    }
  }, [campaigns]);

  const createCampaign = useCallback((name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const campaign = {
      id: `camp_${Date.now()}`,
      name: trimmed,
      createdAt: new Date().toISOString(),
      leads: [],
    };
    setCampaigns((prev) => [campaign, ...prev]);
    return campaign;
  }, []);

  const addLeadsToCampaign = useCallback((campaignId, prospects, provenanceContext) => {
    if (!campaignId || !Array.isArray(prospects) || prospects.length === 0) return;
    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id !== campaignId) return c;
        const existing = new Set(c.leads.map((l) => l.prospectId));
        const additions = prospects
          .filter((p) => p && p.name && !existing.has(p.name))
          .map((p) => adaptProspectToLead(p, provenanceContext));
        if (additions.length === 0) return c;
        return { ...c, leads: [...c.leads, ...additions] };
      }),
    );
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
  }, []);

  const updateLeadNotes = useCallback((campaignId, prospectId, notes) => {
    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id !== campaignId) return c;
        return {
          ...c,
          leads: c.leads.map((l) =>
            l.prospectId === prospectId ? { ...l, notes } : l,
          ),
        };
      }),
    );
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
