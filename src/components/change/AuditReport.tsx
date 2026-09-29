import Link from "next/link";
import clsx from "clsx";
import { Card, CardBody, CardHeader, Eyebrow, Pill } from "@/components/ui/Surfaces";
import { AUDIT_CATEGORY_LABELS, type AuditCategory, type AuditResult } from "@/lib/engine/types";

const ORDER: AuditCategory[] = ["contraditoria", "valores_divergentes", "duplicada", "sobreposta", "base_conhecimento", "estrutura", "mal_escrita"];
const SEVERITY = {
  alta: { tone: "removed" as const, label: "Alta" },
  media: { tone: "warn" as const, label: "Média" },
  baixa: { tone: "neutral" as const, label: "Baixa" },
};

/** Relatório da revisão completa do prompt: nada é alterado, cada ponto vira um pedido de correção. */
export function AuditReport({ audit, slug }: { audit: AuditResult; slug: string }) {
  const total = Object.values(audit.counts).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <Eyebrow>Resultado da revisão</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {ORDER.map((cat) => {
              const n = audit.counts[cat] ?? 0;
              return (
                <a
                  key={cat}
                  href={n ? `#cat-${cat}` : undefined}
                  className={clsx(
                    "rounded border px-3 py-2 text-left",
                    n ? "border-line bg-surface hover:border-accent" : "border-dashed border-line bg-sunken/50 text-ink-faint"
                  )}
                >
                  <div className={clsx("text-lg font-semibold leading-none", n ? "text-ink" : "text-ink-faint")}>{n}</div>
                  <div className="mt-1 text-[11.5px]">{AUDIT_CATEGORY_LABELS[cat]}</div>
                </a>
              );
            })}
          </div>
          <p className="text-[12.5px] text-ink-faint">
            {audit.checkedRules} regras comparadas · base de conhecimento:{" "}
            {audit.knowledgeDocuments ? `${audit.knowledgeDocuments} documento(s) (${audit.knowledgeScope})` : `nenhum documento para ${audit.knowledgeScope}`}
          </p>
          {total === 0 && <p className="text-sm text-added">✓ Nenhuma duplicidade, contradição ou valor divergente encontrado.</p>}
        </CardBody>
      </Card>

      {ORDER.map((cat) => {
        const items = audit.findings.filter((f) => f.category === cat);
        if (!items.length) return null;
        const hidden = (audit.counts[cat] ?? 0) - items.length;
        return (
          <Card key={cat} id={`cat-${cat}`} className="scroll-mt-4">
            <CardHeader className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">{AUDIT_CATEGORY_LABELS[cat]}</span>
              <span className="text-xs text-ink-faint">{audit.counts[cat]} encontrado(s)</span>
            </CardHeader>
            <CardBody className="space-y-3">
              {items.map((f) => (
                <div key={f.id} className="rounded border border-line px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Pill tone={SEVERITY[f.severity].tone}>{SEVERITY[f.severity].label}</Pill>
                      <span className="text-[13px] font-medium text-ink">{f.title}</span>
                    </div>
                    {f.suggestedRequest && (
                      <Link
                        href={`/p/${slug}/alterar?pedido=${encodeURIComponent(f.suggestedRequest)}`}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        Pedir correção →
                      </Link>
                    )}
                  </div>
                  <p className="mt-1 text-[12.5px] text-ink-soft">{f.detail}</p>
                  <ul className="mt-2 space-y-1">
                    {f.rules.map((r, i) => (
                      <li key={i} className="flex gap-2 text-[12.5px]">
                        <span className="w-12 shrink-0 pt-px text-right font-mono text-[11px] text-ink-faint">L{r.line + 1}</span>
                        <span className="min-w-0">
                          <span className="text-ink">&ldquo;{r.text}&rdquo;</span>
                          <span className="ml-1.5 text-[11px] text-ink-faint">{r.section}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {hidden > 0 && <p className="text-xs text-ink-faint">+ {hidden} outro(s) do mesmo tipo não exibido(s), para não poluir a lista.</p>}
            </CardBody>
          </Card>
        );
      })}

      <div className="rounded border border-line bg-sunken px-4 py-3 text-[12.5px] text-ink-soft">
        {audit.limitations.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
    </div>
  );
}
