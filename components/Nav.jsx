const TABS = [
  { id: 'finder', label: 'Prospect Finder', icon: '◎' },
  { id: 'campaigns', label: 'Campaigns', icon: '☰' },
];

export default function Nav({ view, onChange }) {
  return (
    <nav className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)]/60 p-1">
      {TABS.map((tab) => {
        const active = view === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-xs font-medium transition ${
              active
                ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)] shadow-[inset_0_0_0_1px_var(--color-accent)]/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="font-mono text-[11px] opacity-80">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
