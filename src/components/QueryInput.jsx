import { useState } from 'react';

const PLACEHOLDER =
  'Find me VP Revenue at independent hotel groups in Southeast Asia who are publicly frustrated with OTA commission rates.';

const EXAMPLES = [
  'VP Revenue at SEA hotel groups frustrated with OTA fees',
  'CTOs at corporate TMCs hiring AI/ML engineers in 2024',
  'Heads of partnerships at airline loyalty programs open to fintech',
];

export default function QueryInput({ onSubmit }) {
  const [value, setValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    onSubmit(q);
  };

  return (
    <section className="space-y-4 animate-[fadeIn_0.4s_ease-out_both]">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-zinc-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]" />
          <span>Step 01 — Query</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">
          What kind of prospects are you hunting?
        </h1>
        <p className="text-sm text-zinc-500">
          Describe the ideal buyer in plain English. Deal-Radar parses intent, finds matching companies, enriches decision-makers, and writes the first email.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={4}
          autoFocus
          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4 text-[15px] leading-relaxed text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setValue(ex)}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-panel)]/60 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-[var(--color-accent)]/50 hover:text-zinc-100"
              >
                {ex}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={!value.trim()}
            className="group inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-black shadow-[0_0_24px_-6px_var(--color-accent)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 disabled:shadow-none"
          >
            Run Deal-Radar
            <span className="transition group-hover:translate-x-0.5">→</span>
          </button>
        </div>
      </form>
    </section>
  );
}
