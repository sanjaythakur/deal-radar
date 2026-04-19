'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import QueryInput from '../components/QueryInput.jsx';
import AgentReasoning from '../components/AgentReasoning.jsx';
import ProspectTable from '../components/ProspectTable.jsx';
import BriefingCard from '../components/BriefingCard.jsx';
import OutreachPanel from '../components/OutreachPanel.jsx';
import Nav from '../components/Nav.jsx';
import CampaignAssignment from '../components/CampaignAssignment.jsx';
import CampaignDashboard from '../components/campaigns/CampaignDashboard.jsx';
import useCampaigns from '../hooks/useCampaigns.js';
import { runDealRadar } from '../lib/client/scaffold.js';

// phase: 'input' | 'reasoning' | 'prospects' | 'briefing' | 'outreach'
// view:  'finder' | 'campaigns'
export default function Page() {
  const [view, setView] = useState('finder');
  const [phase, setPhase] = useState('input');
  const [query, setQuery] = useState('');
  const [prospects, setProspects] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showOutreach, setShowOutreach] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({});
  const [selectedProspectIds, setSelectedProspectIds] = useState(() => new Set());

  const {
    campaigns,
    addLeadsToCampaign,
    createCampaign,
    updateLeadStatus,
    updateLeadNotes,
    bulkUpdateStatus,
    removeLeadsFromCampaign,
  } = useCampaigns();

  const assignedIds = useMemo(() => {
    const s = new Set();
    for (const c of campaigns) for (const l of c.leads) s.add(l.prospectId);
    return s;
  }, [campaigns]);

  const apiDoneRef = useRef(false);
  const animDoneRef = useRef(false);
  const briefingRef = useRef(null);
  const outreachRef = useRef(null);

  const tryRevealProspects = () => {
    if (apiDoneRef.current && animDoneRef.current) {
      setPhase('prospects');
    }
  };

  const handleSubmit = async (q) => {
    setQuery(q);
    setSelected(null);
    setShowOutreach(false);
    setError(null);
    setProgress({});
    setSelectedProspectIds(new Set());
    apiDoneRef.current = false;
    animDoneRef.current = false;
    setPhase('reasoning');

    try {
      const results = await runDealRadar(q, setProgress);
      setProspects(results);
    } catch (err) {
      console.error('Deal-Radar pipeline failed', err);
      setError(err?.message || 'Pipeline failed. Check the backend logs.');
      setProspects([]);
    } finally {
      apiDoneRef.current = true;
      tryRevealProspects();
    }
  };

  const handleReasoningComplete = () => {
    animDoneRef.current = true;
    tryRevealProspects();
  };

  const handleSelect = (p) => {
    setSelected(p);
    setShowOutreach(false);
    if (phase !== 'briefing' && phase !== 'outreach') setPhase('briefing');
  };

  const handleGenerateOutreach = () => {
    setShowOutreach(true);
    setPhase('outreach');
  };

  const handleReset = () => {
    setView('finder');
    setPhase('input');
    setQuery('');
    setProspects([]);
    setSelected(null);
    setShowOutreach(false);
    setError(null);
    setProgress({});
    setSelectedProspectIds(new Set());
    apiDoneRef.current = false;
    animDoneRef.current = false;
  };

  const toggleProspect = (id) => {
    setSelectedProspectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllProspects = () => {
    setSelectedProspectIds((prev) => {
      if (prev.size === prospects.length) return new Set();
      return new Set(prospects.map((p) => p.name));
    });
  };

  const handleAddToCampaign = (campaignId, prospectsToAdd, provenanceContext) => {
    addLeadsToCampaign(campaignId, prospectsToAdd, provenanceContext);
    setSelectedProspectIds(new Set());
  };

  const provenanceContext = useMemo(
    () => ({
      query,
      pipelineStats: progress,
      totalCandidates: prospects.length,
    }),
    [query, progress, prospects.length],
  );

  useEffect(() => {
    if (view !== 'finder') return;
    if (phase === 'briefing' && briefingRef.current) {
      briefingRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [phase, selected, view]);

  useEffect(() => {
    if (view !== 'finder') return;
    if (showOutreach && outreachRef.current) {
      outreachRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showOutreach, selected, view]);

  const showReasoning = phase !== 'input';
  const showProspects = ['prospects', 'briefing', 'outreach'].includes(phase);
  const showBriefing = ['briefing', 'outreach'].includes(phase) && selected;
  const reasoningCollapsed = showProspects;

  const selectedProspectObjects = useMemo(
    () => prospects.filter((p) => selectedProspectIds.has(p.name)),
    [prospects, selectedProspectIds],
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--color-border)]/60 bg-[var(--color-bg)]/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <button
            onClick={handleReset}
            className="flex items-center gap-2.5 text-left transition hover:opacity-80"
          >
            <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 font-mono text-sm font-bold text-[var(--color-accent)]">
              ◎
              <span className="absolute inset-0 rounded-md bg-[var(--color-accent)]/20 blur-md -z-10" />
            </span>
            <div className="leading-tight">
              <div className="font-semibold tracking-tight text-zinc-100">Deal-Radar</div>
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
                v0.2 · live
              </div>
            </div>
          </button>
          <Nav view={view} onChange={setView} />
          <div className="hidden text-[11px] font-mono uppercase tracking-[0.18em] text-zinc-500 lg:block">
            ContextCon Hackathon Demo
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
        {view === 'campaigns' ? (
          <CampaignDashboard
            campaigns={campaigns}
            updateLeadStatus={updateLeadStatus}
            updateLeadNotes={updateLeadNotes}
            bulkUpdateStatus={bulkUpdateStatus}
            removeLeadsFromCampaign={removeLeadsFromCampaign}
          />
        ) : (
          <>
            {phase === 'input' && <QueryInput onSubmit={handleSubmit} />}

            {phase !== 'input' && query && (
              <div className="space-y-1.5 animate-[fadeIn_0.3s_ease-out_both]">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
                  Query
                </div>
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)]/40 px-4 py-3 text-sm text-zinc-300">
                  <span className="text-[var(--color-accent)] font-mono">›</span> {query}
                </div>
              </div>
            )}

            {showReasoning && (
              <AgentReasoning
                onComplete={handleReasoningComplete}
                collapsed={reasoningCollapsed}
                progress={progress}
              />
            )}

            {error && phase !== 'input' && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200 animate-[fadeSlide_0.35s_ease-out_both]">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-red-400">⚠</span>
                  <div className="flex-1 space-y-2">
                    <div className="font-medium text-red-100">Pipeline failed</div>
                    <div className="font-mono text-xs leading-relaxed text-red-300/90">
                      {error}
                    </div>
                    <button
                      onClick={handleReset}
                      className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-100 transition hover:bg-red-500/20"
                    >
                      Try again →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showProspects && prospects.length === 0 && !error && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]/60 p-6 text-center text-sm text-zinc-400">
                No prospects matched the ICP. Try broadening the query.
              </div>
            )}

            {showProspects && prospects.length > 0 && (
              <ProspectTable
                prospects={prospects}
                selectedId={selected?.name}
                onSelect={handleSelect}
                selectedIds={selectedProspectIds}
                onToggleSelect={toggleProspect}
                onToggleSelectAll={toggleAllProspects}
                assignedIds={assignedIds}
              />
            )}

            {showProspects && prospects.length > 0 && (
              <CampaignAssignment
                campaigns={campaigns}
                selectedProspects={selectedProspectObjects}
                onAddToCampaign={handleAddToCampaign}
                onCreateCampaign={createCampaign}
                provenanceContext={provenanceContext}
              />
            )}

            {showBriefing && (
              <div ref={briefingRef}>
                <BriefingCard
                  prospect={selected}
                  onGenerateOutreach={handleGenerateOutreach}
                  outreachReady={showOutreach}
                />
              </div>
            )}

            {showOutreach && selected && (
              <div ref={outreachRef}>
                <OutreachPanel prospect={selected} allProspects={prospects} />
              </div>
            )}
          </>
        )}

        <footer className="pt-8 pb-2 text-center text-[11px] font-mono text-zinc-600">
          live · Crustdata + OpenAI
        </footer>
      </main>
    </div>
  );
}
