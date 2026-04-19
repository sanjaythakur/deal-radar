function SectionLabel({ children }) {
  return (
    <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
      {children}
    </div>
  );
}

export default function BriefingCard({ prospect, onGenerateOutreach, outreachReady }) {
  return (
    <section className="space-y-3 animate-[fadeSlide_0.35s_ease-out_both]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-zinc-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]" />
          <span>Step 04 — Pre-call briefing</span>
        </div>
        <span className="text-[11px] font-mono text-zinc-600">{prospect.name}</span>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]/60 p-6 space-y-6">
        <div className="flex items-start justify-between gap-6 border-b border-[var(--color-border)] pb-5">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100">{prospect.name}</h2>
            <p className="text-sm text-zinc-400">
              {prospect.title} · {prospect.company}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">{prospect.location}</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Why-Now</div>
            <div className="text-2xl font-semibold text-[var(--color-accent)] font-mono">
              {prospect.score}
            </div>
          </div>
        </div>

        {prospect.companyNews && (
          <div className="space-y-2">
            <SectionLabel>Company news</SectionLabel>
            <p className="text-sm leading-relaxed text-zinc-300">{prospect.companyNews}</p>
          </div>
        )}

        {prospect.recentPost && (
          <div className="space-y-2">
            <SectionLabel>Their recent signal</SectionLabel>
            <blockquote className="border-l-2 border-[var(--color-warn)] pl-4 text-sm italic leading-relaxed text-zinc-300">
              {prospect.recentPost}
            </blockquote>
          </div>
        )}

        {prospect.painPoint && (
          <div className="space-y-2">
            <SectionLabel>Inferred pain point</SectionLabel>
            <p className="text-sm leading-relaxed text-zinc-300">{prospect.painPoint}</p>
          </div>
        )}

        {prospect.talkingPoints?.length > 0 && (
          <div className="space-y-2">
            <SectionLabel>Suggested talking points</SectionLabel>
            <ul className="space-y-1.5 text-sm text-zinc-300">
              {prospect.talkingPoints.map((tp, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block h-1 w-1 flex-shrink-0 rounded-full bg-[var(--color-accent)]" />
                  <span className="leading-relaxed">{tp}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-2">
          <button
            onClick={onGenerateOutreach}
            disabled={outreachReady}
            className="group inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-black shadow-[0_0_24px_-6px_var(--color-accent)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 disabled:shadow-none"
          >
            {outreachReady ? 'Outreach generated below' : 'Generate Outreach'}
            <span className="transition group-hover:translate-x-0.5">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
