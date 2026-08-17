"use client";

import { cn } from "@/lib/utils";

/** 轻量 hover/focus 提示（图标按钮 aria-label 的补充）。装饰性，非必要功能。 */
export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-[1300] -translate-x-1/2 whitespace-nowrap rounded-md bg-fg px-2 py-1 text-xs text-accent-on opacity-0 transition-opacity duration-150 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {label}
      </span>
    </span>
  );
}
