import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base text-fg",
      "placeholder:text-meta transition-colors duration-150 resize-y min-h-24",
      "focus-visible:outline-none focus-visible:border-accent",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
