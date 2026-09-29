import clsx from "clsx";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui/Surfaces";
import type { ValidationResult } from "@/lib/engine/types";

const ICON = { ok: "✓", aviso: "⚠", erro: "✕" } as const;

/** Resultado da validação automática (seção 9). */
export function ValidationPanel({ validation }: { validation: ValidationResult }) {
  const summary = {
    ok: { tone: "added" as const, label: "Nenhum problema encontrado" },
    aviso: { tone: "warn" as const, label: "Pontos de atenção" },
    erro: { tone: "removed" as const, label: "Problemas encontrados" },
  }[validation.summary];

  return (
    <Card className={clsx(validation.summary === "ok" ? "border-added-border" : validation.summary === "aviso" ? "border-warn-border" : "border-removed-border")}>
      <CardHeader className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">Resultado da validação</span>
        <Pill tone={summary.tone}>{summary.label}</Pill>
      </CardHeader>
      <CardBody>
        <ul className="space-y-2">
          {validation.checks.map((c) => (
            <li key={c.label}>
              <div
                className={clsx(
                  "text-sm font-medium",
                  c.status === "ok" ? "text-added" : c.status === "aviso" ? "text-warn" : "text-removed"
                )}
              >
                {ICON[c.status]} {c.label}
              </div>
              {c.details.length > 0 && (
                <ul className={clsx("ml-5 mt-0.5 space-y-0.5 text-[12.5px]", c.status === "ok" ? "text-ink-faint" : "text-ink-soft")}>
                  {c.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
