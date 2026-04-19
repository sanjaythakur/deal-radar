export const MOCK_CAMPAIGNS = [
  {
    id: 'camp_001',
    name: 'SEA Hotel Outreach Q2',
    createdAt: '2025-04-01',
    leads: [],
  },
  {
    id: 'camp_002',
    name: 'Corporate TMC AI Signal',
    createdAt: '2025-03-18',
    leads: [],
  },
  {
    id: 'camp_003',
    name: 'APAC Loyalty Partnerships',
    createdAt: '2025-03-05',
    leads: [],
  },
];

export const LEAD_STATUSES = [
  {
    value: 'Not Started',
    short: 'Not Started',
    pill: 'border-zinc-600/50 bg-zinc-700/30 text-zinc-300',
    dot: 'bg-zinc-400',
  },
  {
    value: 'Email Sent',
    short: 'Sent',
    pill: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
    dot: 'bg-sky-400',
  },
  {
    value: 'Replied',
    short: 'Replied',
    pill: 'border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10 text-[var(--color-accent)]',
    dot: 'bg-[var(--color-accent)]',
  },
  {
    value: 'Meeting Booked',
    short: 'Booked',
    pill: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    dot: 'bg-emerald-400',
  },
  {
    value: 'Not Interested',
    short: 'Not Interested',
    pill: 'border-[var(--color-warn)]/50 bg-[var(--color-warn)]/10 text-[var(--color-warn)]',
    dot: 'bg-[var(--color-warn)]',
  },
  {
    value: 'Bounced',
    short: 'Bounced',
    pill: 'border-red-500/40 bg-red-500/10 text-red-300',
    dot: 'bg-red-400',
  },
];

export const LEAD_STATUS_BY_VALUE = LEAD_STATUSES.reduce((acc, s) => {
  acc[s.value] = s;
  return acc;
}, {});

export const DEFAULT_LEAD_STATUS = 'Not Started';
