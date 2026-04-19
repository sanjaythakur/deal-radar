import { useEffect, useRef, useState } from 'react';

export default function CampaignAssignment({
  campaigns,
  selectedProspects,
  onAddToCampaign,
  onCreateCampaign,
  provenanceContext,
}) {
  const [mode, setMode] = useState('existing');
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || '');
  const [newName, setNewName] = useState('');
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    if (campaigns.length === 0) {
      setMode('new');
      return;
    }
    if (!campaigns.some((c) => c.id === campaignId)) {
      setCampaignId(campaigns[0].id);
    }
  }, [campaigns, campaignId]);

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  const showToast = (message) => {
    setToast(message);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  };

  const canSubmit =
    selectedProspects.length > 0 &&
    ((mode === 'existing' && !!campaignId) || (mode === 'new' && newName.trim().length > 0));

  const handleSubmit = () => {
    if (!canSubmit) return;
    let targetId = campaignId;
    let targetName;
    if (mode === 'new') {
      const created = onCreateCampaign(newName.trim());
      if (!created) return;
      targetId = created.id;
      targetName = created.name;
      setNewName('');
      setMode('existing');
      setCampaignId(created.id);
    } else {
      targetName = campaigns.find((c) => c.id === targetId)?.name || '';
    }
    onAddToCampaign(targetId, selectedProspects, provenanceContext);
    const n = selectedProspects.length;
    showToast(`✓ ${n} ${n === 1 ? 'lead' : 'leads'} added to '${targetName}'`);
  };

  return (
    <section className="space-y-3 animate-[fadeSlide_0.35s_ease-out_both]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-zinc-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]" />
          <span>Add to campaign</span>
        </div>
        <span className="text-[11px] font-mono text-zinc-600">
          {selectedProspects.length} selected
        </span>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]/60 p-5 space-y-4">
        <div className="text-sm text-zinc-300">Add selected prospects to a campaign</div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="campaign-mode"
              checked={mode === 'existing'}
              onChange={() => setMode('existing')}
              className="accent-[var(--color-accent)]"
              disabled={campaigns.length === 0}
            />
            <span className={campaigns.length === 0 ? 'text-zinc-600' : 'text-zinc-300'}>
              Existing campaign
            </span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="campaign-mode"
              checked={mode === 'new'}
              onChange={() => setMode('new')}
              className="accent-[var(--color-accent)]"
            />
            <span className="text-zinc-300">New campaign</span>
          </label>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {mode === 'existing' ? (
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-zinc-200 focus:border-[var(--color-accent)]/60 focus:outline-none"
            >
              {campaigns.length === 0 && <option value="">No campaigns yet</option>}
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.leads.length})
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New campaign name"
              className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-[var(--color-accent)]/60 focus:outline-none"
            />
          )}

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition ${
              canSubmit
                ? 'bg-[var(--color-accent)] text-[var(--color-bg)] hover:bg-[var(--color-accent)]/90'
                : 'bg-[var(--color-panel)] text-zinc-600 cursor-not-allowed border border-[var(--color-border)]'
            }`}
          >
            <span>+</span>
            <span>Add to Campaign</span>
          </button>
        </div>

        {toast && (
          <div className="animate-[fadeSlide_0.3s_ease-out_both] rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-3 py-2 text-xs font-medium text-[var(--color-accent)]">
            {toast}
          </div>
        )}
      </div>
    </section>
  );
}
