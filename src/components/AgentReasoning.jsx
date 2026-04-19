import { useEffect, useState } from 'react';

// Each step's `metaKey` (when present) is looked up in the progress object
// passed in from runDealRadar. While unknown the meta line is hidden; once
// the backend returns a real count it appears next to the step label.
const STEPS = [
  { icon: '🔍', text: 'Parsing query intent and extracting ICP filters...' },
  {
    icon: '🏢',
    text: 'Resolving target companies via /company/search...',
    metaKey: 'companies_matched',
    metaLabel: (n) => `${n} companies matched`,
  },
  {
    icon: '👤',
    text: 'Searching decision-makers via /person/search...',
    metaKey: 'candidates_found',
    metaLabel: (n) => `${n} candidates found`,
  },
  {
    icon: '✨',
    text: 'Enriching top candidates via /person/enrich...',
    metaKey: 'profiles_enriched',
    metaLabel: (n) => `${n} profiles enriched`,
  },
  {
    icon: '📡',
    text: 'Scanning web signals via /web/search...',
    metaKey: 'signals_found',
    metaLabel: (n) => `signals found for ${n}`,
  },
  { icon: '🧠', text: 'Scoring candidates by Why-Now momentum...' },
  { icon: '📝', text: 'Generating personalised outreach lines...' },
  {
    icon: '✅',
    text: 'Done.',
    metaKey: 'prospects_ready',
    metaLabel: (n) => `${n} prospects ready`,
  },
];

const STEP_DELAY = 700;

export default function AgentReasoning({ onComplete, collapsed = false, progress = {} }) {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (collapsed) {
      setActiveIdx(STEPS.length);
      return;
    }
    if (activeIdx >= STEPS.length) {
      onComplete?.();
      return;
    }
    const t = setTimeout(() => setActiveIdx((i) => i + 1), STEP_DELAY);
    return () => clearTimeout(t);
  }, [activeIdx, collapsed, onComplete]);

  return (
    <section className="space-y-3 animate-[fadeIn_0.3s_ease-out_both]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-zinc-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]" />
          <span>Step 02 — Agent reasoning</span>
        </div>
        {collapsed && (
          <span className="text-[11px] font-mono text-zinc-600">complete</span>
        )}
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]/70 p-4 font-mono text-[13px] leading-relaxed shadow-inner">
        {STEPS.map((step, i) => {
          const isDone = i < activeIdx;
          const isActive = i === activeIdx;
          const isPending = i > activeIdx;

          const metaValue = step.metaKey ? progress[step.metaKey] : undefined;
          const metaText =
            metaValue !== undefined && metaValue !== null
              ? step.metaLabel(metaValue)
              : null;

          return (
            <div
              key={i}
              className={`flex items-start gap-3 py-1 ${isPending ? 'opacity-30' : ''} ${isActive || isDone ? 'animate-[fadeSlide_0.25s_ease-out_both]' : ''}`}
            >
              <span className="w-5 select-none text-center">
                {isDone ? (
                  <span className="text-[var(--color-accent)]">✓</span>
                ) : isActive ? (
                  <span className="spinner" />
                ) : (
                  <span className="text-zinc-700">·</span>
                )}
              </span>
              <span className="w-5 select-none">{step.icon}</span>
              <span className={`flex-1 ${isDone ? 'text-zinc-300' : isActive ? 'text-zinc-100' : 'text-zinc-500'}`}>
                {step.text}
                {metaText && (
                  <span className="ml-2 text-[var(--color-accent)]">[{metaText}]</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
