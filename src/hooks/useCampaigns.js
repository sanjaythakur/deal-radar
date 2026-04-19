import { useCallback, useEffect, useState } from 'react';

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let detail;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text().catch(() => '');
    }
    const msg =
      typeof detail === 'string'
        ? detail
        : detail?.detail || JSON.stringify(detail);
    throw new Error(`${path} failed (${res.status}): ${msg}`);
  }
  return res.json();
}

export default function useCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await request('/api/campaigns');
      setCampaigns(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      console.error('Failed to load campaigns', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Merge a single campaign returned by the API into local state.
  const upsertCampaign = useCallback((campaign) => {
    if (!campaign?.id) return;
    setCampaigns((prev) => {
      const idx = prev.findIndex((c) => c.id === campaign.id);
      if (idx === -1) return [campaign, ...prev];
      const next = prev.slice();
      next[idx] = campaign;
      return next;
    });
  }, []);

  // --- mutations ---------------------------------------------------------
  // Status / notes / bulk / remove apply optimistically: we compute the new
  // state locally first so the table updates instantly, then reconcile with
  // the server's response. On any failure we refresh to get canonical state.

  const createCampaign = useCallback(
    async (name) => {
      const trimmed = (name || '').trim();
      if (!trimmed) return null;
      try {
        const campaign = await request('/api/campaigns', {
          method: 'POST',
          body: JSON.stringify({ name: trimmed }),
        });
        upsertCampaign(campaign);
        return campaign;
      } catch (e) {
        console.error('createCampaign failed', e);
        return null;
      }
    },
    [upsertCampaign],
  );

  const addLeadsToCampaign = useCallback(
    async (campaignId, prospects, provenanceContext) => {
      if (!campaignId || !Array.isArray(prospects) || prospects.length === 0) return;
      try {
        const updated = await request(
          `/api/campaigns/${encodeURIComponent(campaignId)}/leads`,
          {
            method: 'POST',
            body: JSON.stringify({ prospects, provenanceContext }),
          },
        );
        upsertCampaign(updated);
      } catch (e) {
        console.error('addLeadsToCampaign failed', e);
        refresh();
      }
    },
    [upsertCampaign, refresh],
  );

  // Generic optimistic runner: mutate leads array locally, fire API, reconcile.
  const optimisticLeadUpdate = useCallback(
    async (campaignId, mutateLeads, apiCall) => {
      const now = new Date().toISOString();
      let snapshot;
      setCampaigns((prev) => {
        snapshot = prev;
        return prev.map((c) =>
          c.id === campaignId ? { ...c, leads: mutateLeads(c.leads, now) } : c,
        );
      });
      try {
        const updated = await apiCall();
        upsertCampaign(updated);
      } catch (e) {
        console.error('optimistic update failed, rolling back', e);
        if (snapshot) setCampaigns(snapshot);
        refresh();
      }
    },
    [upsertCampaign, refresh],
  );

  const updateLeadStatus = useCallback(
    (campaignId, prospectId, status) =>
      optimisticLeadUpdate(
        campaignId,
        (leads, now) =>
          leads.map((l) =>
            l.prospectId === prospectId ? { ...l, status, statusUpdatedAt: now } : l,
          ),
        () =>
          request(
            `/api/campaigns/${encodeURIComponent(campaignId)}/lead-update`,
            { method: 'POST', body: JSON.stringify({ prospectId, status }) },
          ),
      ),
    [optimisticLeadUpdate],
  );

  const updateLeadNotes = useCallback(
    (campaignId, prospectId, notes) =>
      optimisticLeadUpdate(
        campaignId,
        (leads) =>
          leads.map((l) => (l.prospectId === prospectId ? { ...l, notes } : l)),
        () =>
          request(
            `/api/campaigns/${encodeURIComponent(campaignId)}/lead-update`,
            { method: 'POST', body: JSON.stringify({ prospectId, notes }) },
          ),
      ),
    [optimisticLeadUpdate],
  );

  const bulkUpdateStatus = useCallback(
    (campaignId, prospectIds, status) => {
      if (!Array.isArray(prospectIds) || prospectIds.length === 0) return undefined;
      const idSet = new Set(prospectIds);
      return optimisticLeadUpdate(
        campaignId,
        (leads, now) =>
          leads.map((l) =>
            idSet.has(l.prospectId) ? { ...l, status, statusUpdatedAt: now } : l,
          ),
        () =>
          request(
            `/api/campaigns/${encodeURIComponent(campaignId)}/leads/bulk-status`,
            { method: 'POST', body: JSON.stringify({ prospectIds, status }) },
          ),
      );
    },
    [optimisticLeadUpdate],
  );

  const removeLeadsFromCampaign = useCallback(
    (campaignId, prospectIds) => {
      if (!Array.isArray(prospectIds) || prospectIds.length === 0) return undefined;
      const idSet = new Set(prospectIds);
      return optimisticLeadUpdate(
        campaignId,
        (leads) => leads.filter((l) => !idSet.has(l.prospectId)),
        () =>
          request(
            `/api/campaigns/${encodeURIComponent(campaignId)}/leads/remove`,
            { method: 'POST', body: JSON.stringify({ prospectIds }) },
          ),
      );
    },
    [optimisticLeadUpdate],
  );

  return {
    campaigns,
    loading,
    error,
    refresh,
    addLeadsToCampaign,
    createCampaign,
    updateLeadStatus,
    updateLeadNotes,
    bulkUpdateStatus,
    removeLeadsFromCampaign,
  };
}
