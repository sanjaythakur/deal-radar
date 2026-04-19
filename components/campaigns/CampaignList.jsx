import { LEAD_STATUS_BY_VALUE } from '../../data/mockCampaigns.js';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusSummary(leads) {
  const counts = {};
  for (const l of leads) {
    counts[l.status] = (counts[l.status] || 0) + 1;
  }
  const order = ['Email Sent', 'Replied', 'Meeting Booked', 'Not Interested', 'Bounced'];
  const parts = order
    .filter((s) => counts[s])
    .map((s) => `${counts[s]} ${LEAD_STATUS_BY_VALUE[s]?.short || s}`);
  return parts;
}

export default function CampaignList({ campaigns, onOpen }) {
  return (
    <section className="space-y-4 animate-[fadeSlide_0.35s_ease-out_both]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-zinc-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]" />
          <span>Campaigns</span>
        </div>
        <span className="text-[11px] font-mono text-zinc-600">
          {campaigns.length} total
        </span>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]/60 p-10 text-center text-sm text-zinc-400">
          No campaigns yet. Run a search and add prospects to a campaign.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {campaigns.map((c, i) => {
            const summary = statusSummary(c.leads);
            return (
              <button
                key={c.id}
                onClick={() => onOpen(c.id)}
                style={{ animationDelay: `${i * 60}ms` }}
                className="group text-left rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]/60 p-5 transition hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-panel)]/80 animate-[fadeSlide_0.35s_ease-out_both]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-zinc-100 truncate">{c.name}</h3>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Created {formatDate(c.createdAt)}
                    </div>
                  </div>
                  <span className="inline-flex items-center justify-center min-w-[2.25rem] rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 font-mono text-xs font-semibold text-zinc-300">
                    {c.leads.length}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-zinc-400 min-h-[1.25rem]">
                  {summary.length === 0 ? (
                    <span className="text-zinc-600">No activity</span>
                  ) : (
                    summary.map((s, idx) => (
                      <span key={s}>
                        {s}
                        {idx < summary.length - 1 && <span className="text-zinc-700 mx-1">·</span>}
                      </span>
                    ))
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    {c.leads.length} {c.leads.length === 1 ? 'lead' : 'leads'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-accent)] opacity-80 group-hover:opacity-100">
                    View Leads <span>→</span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
