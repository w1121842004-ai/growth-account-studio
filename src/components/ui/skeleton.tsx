import { cn } from "@/lib/utils";

/** 骨架屏（5 态 Loading）。暖纸底 + 松绿微光扫过（MOTION_INTENSITY=3）。 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-warm", className)}
      {...props}
    />
  );
}

/** 带松绿微光的思考中骨架（AI 生成态专用）。 */
export function ShimmerBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-gradient-to-r from-surface-warm via-accent-soft/40 to-surface-warm bg-[length:200%_100%]",
        className,
      )}
      style={{ animation: "gos-shimmer 1.6s ease-in-out infinite" }}
    />
  );
}
