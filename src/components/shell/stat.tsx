export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="reveal rounded-lg border bg-card px-5 py-4 shadow-[var(--shadow-hairline)]">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      {/*
        Mono, per the design language for numbers and durations, but NOT
        tabular: these tiles sit side by side rather than stacked in a column,
        so there is nothing to align vertically and tabular figures only open
        gaps around narrow digits.
      */}
      <div className="mt-2 font-mono text-2xl leading-none tracking-tight">
        {value}
      </div>
      {hint && (
        <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
