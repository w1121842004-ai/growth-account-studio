import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-fg",
        "placeholder:text-meta transition-colors duration-150",
        "focus-visible:outline-none focus-visible:border-accent",
        "disabled:bg-surface-warm disabled:text-meta",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
