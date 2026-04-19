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
      }
    },
    [upsertCampaign],
  );

  const updateLeadStatus = useCallback(
    async (campaignId, prospectId, status) => {
      try {
        const updated = await request(
          `/api/campaigns/${encodeURIComponent(campaignId)}/leads/${encodeURIComponent(prospectId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ status }),
          },
        );
        upsertCampaign(updated);
      } catch (e) {
        console.error('updateLeadStatus failed', e);
      }
    },
    [upsertCampaign],
  );

  const updateLeadNotes = useCallback(
    async (campaignId, prospectId, notes) => {
      try {
        const updated = await request(
          `/api/campaigns/${encodeURIComponent(campaignId)}/leads/${encodeURIComponent(prospectId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ notes }),
          },
        );
        upsertCampaign(updated);
      } catch (e) {
        console.error('updateLeadNotes failed', e);
      }
    },
    [upsertCampaign],
  );

  const bulkUpdateStatus = useCallback(
    async (campaignId, prospectIds, status) => {
      if (!Array.isArray(prospectIds) || prospectIds.length === 0) return;
      try {
        const updated = await request(
          `/api/campaigns/${encodeURIComponent(campaignId)}/leads/bulk-status`,
          {
            method: 'POST',
            body: JSON.stringify({ prospectIds, status }),
          },
        );
        upsertCampaign(updated);
      } catch (e) {
        console.error('bulkUpdateStatus failed', e);
      }
    },
    [upsertCampaign],
  );

  const removeLeadsFromCampaign = useCallback(
    async (campaignId, prospectIds) => {
      if (!Array.isArray(prospectIds) || prospectIds.length === 0) return;
      try {
        const updated = await request(
          `/api/campaigns/${encodeURIComponent(campaignId)}/leads/remove`,
          {
            method: 'POST',
            body: JSON.stringify({ prospectIds }),
          },
        );
        upsertCampaign(updated);
      } catch (e) {
        console.error('removeLeadsFromCampaign failed', e);
      }
    },
    [upsertCampaign],
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
