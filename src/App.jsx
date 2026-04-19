import { useEffect, useRef, useState } from 'react';
import QueryInput from './components/QueryInput.jsx';
import AgentReasoning from './components/AgentReasoning.jsx';
import ProspectTable from './components/ProspectTable.jsx';
import BriefingCard from './components/BriefingCard.jsx';
import OutreachPanel from './components/OutreachPanel.jsx';
import { runDealRadar } from './api/scaffold.js';

// phase: 'input' | 'reasoning' | 'prospects' | 'briefing' | 'outreach'
export default function App() {
  const [phase, setPhase] = useState('input');
  const [query, setQuery] = useState('');
  const [prospects, setProspects] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showOutreach, setShowOutreach] = useState(false);

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
    apiDoneRef.current = false;
    animDoneRef.current = false;
    setPhase('reasoning');

    try {
      const results = await runDealRadar(q);
      setProspects(results);
    } catch (err) {
      console.error('Deal-Radar pipeline failed', err);
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
    setPhase('input');
    setQuery('');
    setProspects([]);
    setSelected(null);
    setShowOutreach(false);
    apiDoneRef.current = false;
    animDoneRef.current = false;
  };

  useEffect(() => {
    if (phase === 'briefing' && briefingRef.current) {
      briefingRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [phase, selected]);

  useEffect(() => {
    if (showOutreach && outreachRef.current) {
      outreachRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showOutreach, selected]);

  const showReasoning = phase !== 'input';
  const showProspects = ['prospects', 'briefing', 'outreach'].includes(phase);
  const showBriefing = ['briefing', 'outreach'].includes(phase) && selected;
  const reasoningCollapsed = showProspects;

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--color-border)]/60 bg-[var(--color-bg)]/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
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
                v0.1 · mock
              </div>
            </div>
          </button>
          <div className="hidden text-[11px] font-mono uppercase tracking-[0.18em] text-zinc-500 sm:block">
            ContextCon Hackathon Demo
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
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
          />
        )}

        {showProspects && (
          <ProspectTable
            prospects={prospects}
            selectedId={selected?.name}
            onSelect={handleSelect}
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

        <footer className="pt-8 pb-2 text-center text-[11px] font-mono text-zinc-600">
          mock phase · all API and LLM calls stubbed
        </footer>
      </main>
    </div>
  );
}
