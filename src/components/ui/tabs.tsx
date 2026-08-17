"use client";

import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
}

export function Tabs({
  items,
  value,
  onValueChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-surface p-1",
        className,
      )}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(it.value)}
            className={cn(
              "h-9 rounded px-3 text-sm font-medium transition-colors duration-150",
              "focus-visible:outline-none focus-visible:border-accent",
              active ? "bg-accent-soft text-accent" : "text-muted hover:text-fg",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
