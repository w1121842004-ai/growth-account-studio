"use client";

import { cn } from "@/lib/utils";

export interface ChipOption {
  value: string;
  label: string;
}

/** 单选 chip 组（筛选栏/语调/模板，设计 Token：选中态 --accent）。 */
export function ChipGroup({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: ChipOption[];
  value: string;
  onChange: (v: string) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-full border font-medium transition-colors duration-150",
              "focus-visible:outline-none focus-visible:border-accent",
              size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-3.5 text-sm",
              active
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-surface text-muted hover:text-fg",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
