import { useEffect, useState } from 'react';

const STEPS = [
  { icon: '🔍', text: 'Parsing query intent and extracting ICP filters...', meta: null },
  { icon: '🏢', text: 'Resolving target companies via /company/identify...', meta: 'mock: 14 companies matched' },
  { icon: '👤', text: 'Searching decision-makers via /person/search...', meta: 'mock: 31 candidates found' },
  { icon: '✨', text: 'Enriching top candidates via /person/enrich...', meta: 'mock: 20 profiles enriched' },
  { icon: '📡', text: 'Scanning web signals via /web/search/live...', meta: 'mock: signals found for 13' },
  { icon: '🧠', text: 'Scoring candidates by Why-Now momentum...', meta: null },
  { icon: '📝', text: 'Generating personalised outreach lines...', meta: null },
  { icon: '✅', text: 'Done. 20 prospects ready.', meta: null },
];

const STEP_DELAY = 700;

export default function AgentReasoning({ onComplete, collapsed = false }) {
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
                {step.meta && (
                  <span className="ml-2 text-[var(--color-warn)]">[{step.meta}]</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
