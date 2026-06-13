/**
 * A single summary stat tile: a big number (or short string) over a small
 * uppercase label. Shared by the activity and overall stats views so the two
 * summary grids stay visually identical.
 */
export function SummaryTile({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="lfg-pop-in flex flex-col items-center justify-center rounded-2xl border-2 border-primary/10 bg-card p-3 shadow-sm">
      <span className="text-2xl font-extrabold tabular-nums text-primary">
        {value}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
