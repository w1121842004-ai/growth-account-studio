import { cn } from "@/lib/utils";

/** 实质编辑进度条（审核编辑器）；达标用 --success，未达标用 --danger（审核编辑器.md）。 */
export function Progress({
  value,
  tone = "success",
  className,
}: {
  value: number;
  tone?: "success" | "danger" | "accent";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const color =
    tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "var(--accent)";
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-warm", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-200 ease-standard"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}
