import { CheckCircle2, Loader2, AlertTriangle, Circle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IntegrationStatus } from "./types";

const STATUS_META: Record<IntegrationStatus, { label: string; className: string; Icon: typeof Circle }> = {
  NOT_CONNECTED: {
    label: "Conectar",
    className: "text-muted-foreground border-border bg-muted/50",
    Icon: Circle,
  },
  CONNECTING: {
    label: "Conectando…",
    className: "text-amber-600 border-amber-500/30 bg-amber-500/10 dark:text-amber-400",
    Icon: Loader2,
  },
  CONNECTED: {
    label: "Conectado",
    className: "text-emerald-600 border-emerald-500/30 bg-emerald-500/10 dark:text-emerald-400",
    Icon: CheckCircle2,
  },
  ERROR: {
    label: "Erro",
    className: "text-destructive border-destructive/30 bg-destructive/10",
    Icon: AlertTriangle,
  },
  DISCONNECTED: {
    label: "Desconectado",
    className: "text-muted-foreground border-border bg-muted/50",
    Icon: XCircle,
  },
};

export function IntegrationStatusBadge({ status, className }: { status: IntegrationStatus; className?: string }) {
  const meta = STATUS_META[status];
  const { Icon } = meta;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        meta.className,
        className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", status === "CONNECTING" && "animate-spin")} />
      {meta.label}
    </span>
  );
}

export function statusLabel(status: IntegrationStatus): string {
  return STATUS_META[status].label;
}
