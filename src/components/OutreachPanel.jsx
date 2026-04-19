import { useEffect, useState } from 'react';
import { generateOutreach } from '../api/scaffold.js';

function csvEscape(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(prospects) {
  const headers = [
    'Name',
    'Title',
    'Company',
    'Location',
    'Score',
    'Email Subject',
    'Email Body',
  ];
  const rows = prospects.map((p) =>
    [
      p.name,
      p.title,
      p.company,
      p.location,
      p.score,
      p.emailSubject,
      p.emailBody,
    ]
      .map(csvEscape)
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

function downloadCsv(prospects) {
  const csv = buildCsv(prospects);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'deal-radar-leads.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function OutreachPanel({ prospect, allProspects }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCopied(false);
    generateOutreach(prospect).then((res) => {
      if (cancelled) return;
      setSubject(res.subject);
      setBody(res.body);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [prospect]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="space-y-3 animate-[fadeSlide_0.35s_ease-out_both]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-zinc-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]" />
          <span>Step 05 — Outreach</span>
        </div>
        {loading && (
          <span className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
            <span className="spinner" /> drafting...
          </span>
        )}
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]/60 p-6 space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={loading}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 disabled:opacity-60"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
            Body
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={loading}
            rows={10}
            className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm leading-relaxed text-zinc-100 outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 disabled:opacity-60"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={handleCopy}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-accent)]/60 bg-[var(--color-accent)]/10 px-4 py-2 text-sm font-medium text-[var(--color-accent)] transition hover:bg-[var(--color-accent)]/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? '✓ Copied' : 'Copy to Clipboard'}
          </button>
          <button
            onClick={() => downloadCsv(allProspects)}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-500"
          >
            Download CSV ({allProspects.length} leads)
          </button>
          <span className="text-[11px] font-mono text-zinc-600">
            deal-radar-leads.csv
          </span>
        </div>
      </div>
    </section>
  );
}
