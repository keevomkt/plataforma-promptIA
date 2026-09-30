import { HTMLAttributes } from "react";
import clsx from "clsx";
import { IMPACT_LABELS, STATUS_LABELS, type ImpactLevel } from "@/lib/engine/types";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("rounded border border-line bg-surface shadow-panel", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("border-b border-line px-4 py-3", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("px-4 py-3.5", className)} {...props} />;
}

/** Rótulo pequeno de bloco ("Seções afetadas", "Regras preservadas"...). */
export function Eyebrow({ className, tone = "faint", ...props }: HTMLAttributes<HTMLDivElement> & { tone?: "faint" | "warn" | "removed" | "added" }) {
  const tones = { faint: "text-ink-faint", warn: "text-warn", removed: "text-removed", added: "text-added" };
  return <div className={clsx("text-[11px] font-semibold uppercase tracking-wide", tones[tone], className)} {...props} />;
}

type PillTone = "neutral" | "accent" | "added" | "removed" | "warn";

const pillTones: Record<PillTone, string> = {
  neutral: "bg-sunken text-ink-soft border-line",
  accent: "bg-accent-soft text-accent-strong border-accent/20",
  added: "bg-added-bg text-added border-added-border",
  removed: "bg-removed-bg text-removed border-removed-border",
  warn: "bg-warn-bg text-warn border-warn-border",
};

export function Pill({ tone = "neutral", children, className }: { tone?: PillTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium", pillTones[tone], className)}>
      {children}
    </span>
  );
}

export function ImpactPill({ level }: { level: string | null | undefined }) {
  if (!level) return null;
  const tone: Record<string, PillTone> = { BAIXO: "added", MEDIO: "warn", ALTO: "removed" };
  return <Pill tone={tone[level] ?? "neutral"}>Impacto {IMPACT_LABELS[level as ImpactLevel]?.toLowerCase() ?? level}</Pill>;
}

export function StatusPill({ status }: { status: string }) {
  const tone: Record<string, PillTone> = {
    AGUARDANDO_ESCLARECIMENTO: "warn",
    AGUARDANDO_APROVACAO: "accent",
    SEM_ALTERACAO: "neutral",
    APLICADA: "warn",
    REVISAO_CONCLUIDA: "accent",
    RESPONDIDA: "accent",
    VERSIONADA: "added",
    CANCELADA: "neutral",
  };
  return <Pill tone={tone[status] ?? "neutral"}>{STATUS_LABELS[status] ?? status}</Pill>;
}

export function CurrentTag() {
  return (
    <span className="rounded-sm border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-strong">
      atual
    </span>
  );
}
