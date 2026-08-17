import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 5 态通用：Empty / Error / Loading（Populated/Edge 由各页面自行渲染）。 */

export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center", className)}>
      <Inbox size={24} className="text-meta" aria-hidden />
      <p className="mt-3 font-serif text-lg text-fg">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-danger-soft bg-danger-soft/40 px-6 py-12 text-center", className)}>
      <AlertTriangle size={24} className="text-danger" aria-hidden />
      <p className="mt-3 font-serif text-lg text-fg">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw size={16} /> 重试
        </Button>
      )}
    </div>
  );
}

export function LoadingState({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-6 py-12 text-muted", className)}>
      <Loader2 size={20} className="animate-spin text-accent" aria-hidden />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
