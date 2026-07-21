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
    <div className="rounded-lg border bg-card px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 font-mono text-2xl tabular">{value}</div>
      {hint && (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
