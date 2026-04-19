import { useEffect, useState } from 'react';

// Each step optionally carries a `gateKey` — the key in the `progress` object
// that must be set (by the backend response) before the step can be marked
// done. This keeps the spinner on the *real* in-flight step instead of
// racing ahead of the API. `metaKey` (when present) drives the small
// "[N companies matched]" badge that appears once the count arrives.
const STEPS = [
  {
    icon: '🔍',
    text: 'Parsing query intent and extracting ICP filters...',
    gateKey: 'parsed',
  },
  {
    icon: '🏢',
    text: 'Resolving target companies via /company/search...',
    gateKey: 'companies_matched',
    metaKey: 'companies_matched',
    metaLabel: (n) => `${n} companies matched`,
  },
  {
    icon: '👤',
    text: 'Searching decision-makers via /person/search...',
    gateKey: 'candidates_found',
    metaKey: 'candidates_found',
    metaLabel: (n) => `${n} candidates found`,
  },
  {
    icon: '✨',
    text: 'Enriching top candidates via /person/enrich...',
    gateKey: 'profiles_enriched',
    metaKey: 'profiles_enriched',
    metaLabel: (n) => `${n} profiles enriched`,
  },
  {
    icon: '📡',
    text: 'Scanning web signals via /screener/web-search...',
    gateKey: 'signals_found',
    metaKey: 'signals_found',
    metaLabel: (n) => `signals found for ${n}`,
  },
  {
    icon: '🧠',
    text: 'Scoring candidates by Why-Now momentum...',
    gateKey: 'scored',
  },
  { icon: '📝', text: 'Drafting personalised outreach angles...' },
  {
    icon: '✅',
    text: 'Done.',
    gateKey: 'prospects_ready',
    metaKey: 'prospects_ready',
    metaLabel: (n) => `${n} prospects ready`,
  },
];

const MIN_STEP_MS = 450;

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
    const step = STEPS[activeIdx];
    const gateReady = !step.gateKey || progress[step.gateKey] !== undefined;
    // Hold the spinner on this step until the backend reports its key.
    if (!gateReady) return;
    const t = setTimeout(() => setActiveIdx((i) => i + 1), MIN_STEP_MS);
    return () => clearTimeout(t);
  }, [activeIdx, collapsed, onComplete, progress]);

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
