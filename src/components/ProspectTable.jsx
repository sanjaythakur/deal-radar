function scoreStyle(score) {
  if (score >= 70) {
    return 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]';
  }
  if (score >= 40) {
    return 'border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 text-[var(--color-warn)]';
  }
  return 'border-red-500/40 bg-red-500/10 text-red-400';
}

export default function ProspectTable({ prospects, selectedId, onSelect }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-zinc-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]" />
          <span>Step 03 — Ranked prospects</span>
        </div>
        <span className="text-[11px] font-mono text-zinc-600">
          {prospects.length} results · ranked by Why-Now
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]/60">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[11px] font-mono uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3 font-medium">Name / Title</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Signal</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {prospects.map((p, i) => {
              const isSelected = selectedId === p.name;
              return (
                <tr
                  key={p.name}
                  style={{ animationDelay: `${i * 70}ms` }}
                  className={`group border-b border-[var(--color-border)]/60 last:border-b-0 transition animate-[fadeSlide_0.35s_ease-out_both] ${isSelected ? 'bg-[var(--color-accent)]/[0.06]' : 'hover:bg-white/[0.02]'}`}
                >
                  <td className="px-4 py-3.5 align-top">
                    <div className="font-medium text-zinc-100">{p.name}</div>
                    <div className="text-xs text-zinc-500">{p.title}</div>
                  </td>
                  <td className="px-4 py-3.5 align-top text-zinc-300">{p.company}</td>
                  <td className="px-4 py-3.5 align-top text-zinc-400">{p.location}</td>
                  <td className="px-4 py-3.5 align-top">
                    <span
                      className={`inline-flex min-w-[2.5rem] justify-center rounded-md border px-2 py-0.5 font-mono text-xs font-semibold ${scoreStyle(p.score)}`}
                    >
                      {p.score}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 align-top">
                    <div className="flex items-start gap-2 text-xs text-zinc-400">
                      <span className="mt-0.5 text-[var(--color-warn)]">◆</span>
                      <span>{p.hook}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 align-top text-right">
                    <button
                      onClick={() => onSelect(p)}
                      className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium transition ${isSelected ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : 'border-[var(--color-border)] text-zinc-300 hover:border-[var(--color-accent)]/60 hover:text-[var(--color-accent)]'}`}
                    >
                      {isSelected ? 'Viewing' : 'View Briefing'}
                      <span>→</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
