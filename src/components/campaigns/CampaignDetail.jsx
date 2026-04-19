import { useEffect, useMemo, useRef, useState } from 'react';
import { LEAD_STATUSES, LEAD_STATUS_BY_VALUE } from '../../data/mockCampaigns.js';
import BriefingCard from '../BriefingCard.jsx';
import OutreachPanel from '../OutreachPanel.jsx';

function csvEscape(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function slugify(name) {
  return (name || 'campaign')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function triggerDownload(filename, content, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function joinList(arr) {
  return Array.isArray(arr) ? arr.filter(Boolean).join('; ') : '';
}

function buildLeadsCsv(campaign) {
  const headers = [
    'Name',
    'Title',
    'Company',
    'Location',
    'Score',
    'Status',
    'Status Updated',
    'Notes',
    'Work Email',
    'Personal Email',
    'Phone',
    'LinkedIn URL',
    'Company Domain',
    'All Work Emails',
    'All Personal Emails',
    'All Phones',
    'Websites',
    'Added At',
  ];
  const rows = campaign.leads.map((l) =>
    [
      l.name,
      l.title,
      l.company,
      l.location,
      l.score,
      l.status,
      l.statusUpdatedAt,
      l.notes,
      (l.business_emails && l.business_emails[0]) || '',
      (l.personal_emails && l.personal_emails[0]) || '',
      (l.phone_numbers && l.phone_numbers[0]) || '',
      l.profile_url || '',
      l.company_domain || '',
      joinList(l.business_emails),
      joinList(l.personal_emails),
      joinList(l.phone_numbers),
      joinList(l.websites),
      l.addedAt,
    ]
      .map(csvEscape)
      .join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

function buildProvenanceJson(campaign) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      campaign: {
        id: campaign.id,
        name: campaign.name,
        createdAt: campaign.createdAt,
        leadCount: campaign.leads.length,
      },
      leads: campaign.leads.map((l) => ({
        prospectId: l.prospectId,
        name: l.name,
        title: l.title,
        company: l.company,
        location: l.location,
        score: l.score,
        status: l.status,
        statusUpdatedAt: l.statusUpdatedAt,
        notes: l.notes,
        addedAt: l.addedAt,
        provenance: l.provenance || null,
      })),
    },
    null,
    2,
  );
}

function scoreStyle(score) {
  if (score >= 70) {
    return 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]';
  }
  if (score >= 40) {
    return 'border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 text-[var(--color-warn)]';
  }
  return 'border-red-500/40 bg-red-500/10 text-red-400';
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateLong(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const status = LEAD_STATUS_BY_VALUE[value] || LEAD_STATUSES[0];

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition ${status.pill}`}
      >
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${status.dot}`} />
        <span>{status.value}</span>
        <span className="opacity-60">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 min-w-[10rem] rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] shadow-lg shadow-black/40 py-1 animate-[fadeIn_0.15s_ease-out_both]">
          {LEAD_STATUSES.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-white/5 ${
                opt.value === value ? 'text-zinc-100' : 'text-zinc-300'
              }`}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${opt.dot}`} />
              <span>{opt.value}</span>
              {opt.value === value && (
                <span className="ml-auto text-[var(--color-accent)]">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotesInput({ value, onSave }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => setDraft(value || ''), [value]);
  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== (value || '')) onSave(draft);
      }}
      placeholder="Add a note…"
      className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-zinc-300 placeholder:text-zinc-600 transition focus:border-[var(--color-accent)]/40 focus:bg-[var(--color-bg)] focus:py-1.5 focus:outline-none"
    />
  );
}

function BulkStatusMenu({ onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs text-zinc-200 transition hover:border-[var(--color-accent)]/50"
      >
        <span>Mark as</span>
        <span className="opacity-60">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 min-w-[10rem] rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] shadow-lg shadow-black/40 py-1">
          {LEAD_STATUSES.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onSelect(opt.value);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 transition hover:bg-white/5"
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${opt.dot}`} />
              <span>{opt.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CampaignDetail({
  campaign,
  onBack,
  updateLeadStatus,
  updateLeadNotes,
  bulkUpdateStatus,
  removeLeadsFromCampaign,
}) {
  const [selected, setSelected] = useState(() => new Set());
  const [openLeadId, setOpenLeadId] = useState(null);
  const [showOutreach, setShowOutreach] = useState(false);
  const briefingRef = useRef(null);

  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set(campaign.leads.map((l) => l.prospectId));
      const next = new Set();
      for (const id of prev) if (valid.has(id)) next.add(id);
      return next;
    });
    if (openLeadId && !campaign.leads.some((l) => l.prospectId === openLeadId)) {
      setOpenLeadId(null);
      setShowOutreach(false);
    }
  }, [campaign.leads, openLeadId]);

  useEffect(() => {
    if (openLeadId && briefingRef.current) {
      briefingRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [openLeadId, showOutreach]);

  const openLead = openLeadId ? campaign.leads.find((l) => l.prospectId === openLeadId) : null;

  const toggleOpenLead = (prospectId) => {
    if (openLeadId === prospectId) {
      setOpenLeadId(null);
      setShowOutreach(false);
    } else {
      setOpenLeadId(prospectId);
      setShowOutreach(false);
    }
  };

  const handleDownloadCsv = () => {
    triggerDownload(
      `${slugify(campaign.name)}-leads.csv`,
      buildLeadsCsv(campaign),
      'text/csv',
    );
  };

  const handleDownloadProvenance = () => {
    triggerDownload(
      `${slugify(campaign.name)}-provenance.json`,
      buildProvenanceJson(campaign),
      'application/json',
    );
  };

  const counts = useMemo(() => {
    const acc = { contacted: 0, replied: 0 };
    for (const l of campaign.leads) {
      if (['Email Sent', 'Replied', 'Meeting Booked'].includes(l.status)) acc.contacted += 1;
      if (l.status === 'Replied' || l.status === 'Meeting Booked') acc.replied += 1;
    }
    return acc;
  }, [campaign.leads]);

  const toggleAll = () => {
    if (selected.size === campaign.leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(campaign.leads.map((l) => l.prospectId)));
    }
  };

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkStatus = (status) => {
    bulkUpdateStatus(campaign.id, Array.from(selected), status);
  };

  const handleRemove = () => {
    removeLeadsFromCampaign(campaign.id, Array.from(selected));
    setSelected(new Set());
  };

  const allChecked = campaign.leads.length > 0 && selected.size === campaign.leads.length;
  const someChecked = selected.size > 0 && !allChecked;

  return (
    <section className="space-y-4 animate-[fadeSlide_0.35s_ease-out_both]">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 transition hover:text-[var(--color-accent)]"
        >
          <span>←</span>
          <span>Back to campaigns</span>
        </button>
        <span className="text-[11px] font-mono text-zinc-600">{campaign.id}</span>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100">{campaign.name}</h2>
            <div className="text-xs text-zinc-500 mt-1">
              Created {formatDateLong(campaign.createdAt)}
            </div>
            <div className="text-xs font-mono text-zinc-400 mt-2">
              {campaign.leads.length} {campaign.leads.length === 1 ? 'lead' : 'leads'} ·{' '}
              {counts.contacted} contacted · {counts.replied} replied
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadCsv}
              disabled={campaign.leads.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-[var(--color-accent)]/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span>↓</span>
              <span>Leads CSV</span>
            </button>
            <button
              onClick={handleDownloadProvenance}
              disabled={campaign.leads.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-[var(--color-accent)]/50 disabled:cursor-not-allowed disabled:opacity-40"
              title="Full lineage: query, pipeline stats, signals, and ranking for every lead"
            >
              <span>↓</span>
              <span>Provenance JSON</span>
            </button>
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/[0.06] px-4 py-2 animate-[fadeSlide_0.25s_ease-out_both]">
          <span className="text-xs font-medium text-[var(--color-accent)]">
            {selected.size} selected
          </span>
          <BulkStatusMenu onSelect={handleBulkStatus} />
          <button
            onClick={handleRemove}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/20"
          >
            Remove from Campaign
          </button>
        </div>
      )}

      {campaign.leads.length === 0 ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]/60 p-10 text-center text-sm text-zinc-400">
          No leads in this campaign yet. Add some from the Prospect Finder.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]/60">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={toggleAll}
                    className="accent-[var(--color-accent)] h-3.5 w-3.5"
                  />
                </th>
                <th className="px-3 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Title</th>
                <th className="px-3 py-3 font-medium">Company</th>
                <th className="px-3 py-3 font-medium">Score</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Updated</th>
                <th className="px-3 py-3 font-medium">Notes</th>
                <th className="px-3 py-3 font-medium text-right">Briefing</th>
              </tr>
            </thead>
            <tbody>
              {campaign.leads.map((l) => {
                const isChecked = selected.has(l.prospectId);
                return (
                  <tr
                    key={l.prospectId}
                    className={`border-b border-[var(--color-border)]/60 last:border-b-0 transition ${
                      isChecked ? 'bg-[var(--color-accent)]/[0.05]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className="px-3 py-3 align-middle">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(l.prospectId)}
                        className="accent-[var(--color-accent)] h-3.5 w-3.5"
                      />
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <button
                        onClick={() => toggleOpenLead(l.prospectId)}
                        className={`inline-flex items-center gap-1 text-left font-medium transition ${
                          openLeadId === l.prospectId
                            ? 'text-[var(--color-accent)]'
                            : 'text-zinc-100 hover:text-[var(--color-accent)]'
                        }`}
                      >
                        <span>{l.name}</span>
                        <span className="text-[10px] opacity-60">
                          {openLeadId === l.prospectId ? '▴' : '▾'}
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-3 align-middle text-zinc-400">{l.title}</td>
                    <td className="px-3 py-3 align-middle text-zinc-300">{l.company}</td>
                    <td className="px-3 py-3 align-middle">
                      <span
                        className={`inline-flex min-w-[2.25rem] justify-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold ${scoreStyle(l.score)}`}
                      >
                        {l.score}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <StatusDropdown
                        value={l.status}
                        onChange={(s) => updateLeadStatus(campaign.id, l.prospectId, s)}
                      />
                    </td>
                    <td className="px-3 py-3 align-middle text-xs text-zinc-500">
                      {formatDate(l.statusUpdatedAt)}
                    </td>
                    <td className="px-3 py-3 align-middle min-w-[12rem]">
                      <NotesInput
                        value={l.notes}
                        onSave={(n) => updateLeadNotes(campaign.id, l.prospectId, n)}
                      />
                    </td>
                    <td className="px-3 py-3 align-middle text-right">
                      <button
                        onClick={() => toggleOpenLead(l.prospectId)}
                        className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                          openLeadId === l.prospectId
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                            : 'border-[var(--color-border)] text-zinc-300 hover:border-[var(--color-accent)]/60 hover:text-[var(--color-accent)]'
                        }`}
                      >
                        {openLeadId === l.prospectId ? 'Hide' : 'View'}
                        <span>{openLeadId === l.prospectId ? '↑' : '→'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openLead && (
        <div ref={briefingRef} className="space-y-6 pt-2">
          {!openLead.companyNews &&
            !openLead.recentPost &&
            !openLead.painPoint &&
            !(openLead.talkingPoints && openLead.talkingPoints.length) && (
              <div className="rounded-lg border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 p-4 text-xs leading-relaxed text-[var(--color-warn)]">
                This lead was added before briefing snapshots were enabled, so the
                pre-call data isn't stored on it. Re-add the prospect from the
                Prospect Finder to capture full briefing + provenance.
              </div>
            )}
          <BriefingCard
            prospect={openLead}
            onGenerateOutreach={() => setShowOutreach(true)}
            outreachReady={showOutreach}
          />
          {showOutreach && (
            <OutreachPanel prospect={openLead} allProspects={campaign.leads} />
          )}
        </div>
      )}
    </section>
  );
}
