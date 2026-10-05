import { Card, CardBody, Eyebrow, ImpactPill, Pill } from "@/components/ui/Surfaces";
import type { ChangeAnalysis, RuleRef } from "@/lib/engine/types";
import { IMPACT_LABELS, KNOWLEDGE_CATEGORIES } from "@/lib/engine/types";
import Link from "next/link";
import { UnitLogo } from "@/components/Brand";

/** Relatório da análise, na ordem da seção 2 da especificação. */
export function AnalysisReport({ analysis, showSuggestion = true }: { analysis: ChangeAnalysis; showSuggestion?: boolean }) {
  return (
    <Card>
      <CardBody className="space-y-5">
        <Block title="Entendimento da solicitação">
          <p className="text-[15px] leading-relaxed text-ink">{analysis.understanding}</p>
          {analysis.notes.map((n, i) => (
            <p key={i} className="mt-2 rounded border border-line bg-sunken px-3 py-2 text-[13px] text-ink-soft">
              {n}
            </p>
          ))}
        </Block>

        <Block title="Seções afetadas">
          {analysis.affectedSections.length ? (
            <div className="flex flex-wrap gap-1.5">
              {analysis.affectedSections.map((s) => (
                <Pill key={s} tone="accent">
                  {s}
                </Pill>
              ))}
            </div>
          ) : (
            <Empty>Nenhuma seção identificada ainda.</Empty>
          )}
        </Block>

        <Block title="Regras afetadas">
          {analysis.affectedRules.length ? <RuleList rules={analysis.affectedRules} /> : <Empty>Nenhuma regra atual precisa ser modificada.</Empty>}
        </Block>

        <Block title="Possíveis conflitos" tone={analysis.conflicts.length ? "warn" : "faint"}>
          {analysis.conflicts.length ? (
            <ul className="space-y-2">
              {analysis.conflicts.map((c, i) => (
                <li key={i} className="rounded border border-warn-border bg-warn-bg/60 px-3 py-2 text-[13px]">
                  <p className="text-warn">⚠ {c.description}</p>
                  {c.rule && (
                    <p className="mt-1 text-ink-soft">
                      <span className="text-ink-faint">
                        {c.rule.section} · linha {c.rule.line + 1}:{" "}
                      </span>
                      &ldquo;{c.rule.text}&rdquo;
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhum conflito identificado.</Empty>
          )}
        </Block>

        {analysis.relatedRules.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer list-none">
              <Eyebrow className="inline">Outras referências ao assunto ({analysis.relatedRules.length})</Eyebrow>
              <span className="ml-1 text-[11px] text-ink-faint group-open:hidden">mostrar</span>
            </summary>
            <div className="mt-2">
              <RuleList rules={analysis.relatedRules} muted />
            </div>
          </details>
        )}

        {analysis.knowledgeDocuments !== undefined && (
          <Block title="Base de conhecimento">
            {analysis.knowledgeDocuments === 0 ? (
              <Empty>
                Nenhum documento cadastrado.{" "}
                <Link href="/conhecimento" className="text-accent hover:underline">
                  Adicione a base de conhecimento
                </Link>{" "}
                para que a análise mostre as informações oficiais relacionadas ao pedido.
              </Empty>
            ) : analysis.knowledgeRefs?.length ? (
              <ul className="space-y-2">
                {analysis.knowledgeRefs.map((r) => (
                  <li key={r.documentId} className="rounded border border-line bg-sunken px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/conhecimento/${r.documentId}`} className="text-[13px] font-medium text-ink hover:underline">
                        {r.title}
                      </Link>
                      <UnitLogo unit={r.businessUnit} height={18} />
                      <span className="text-[11px] text-ink-faint">{KNOWLEDGE_CATEGORIES[r.category] ?? r.category}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-[12.5px] text-ink-soft">{r.excerpt}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nenhum trecho relacionado nos {analysis.knowledgeDocuments} documento(s) da base.</Empty>
            )}
          </Block>
        )}

        <Block title="Regras que serão preservadas" tone="added">
          {analysis.preservedRules.length > 0 && <RuleList rules={analysis.preservedRules} muted />}
          {analysis.preservedSections.length > 0 && (
            <details className="group mt-2 text-[13px] text-ink-soft">
              <summary className="cursor-pointer list-none">
                <span className="text-added">✓</span> {analysis.preservedSections.length} seções não são tocadas{" "}
                <span className="text-[11px] text-ink-faint group-open:hidden">ver quais</span>
              </summary>
              <p className="mt-1 text-ink-faint">{analysis.preservedSections.join(" · ")}</p>
            </details>
          )}
          {!analysis.preservedRules.length && !analysis.preservedSections.length && <Empty>—</Empty>}
        </Block>

        {showSuggestion && (analysis.suggestion || analysis.suggestedRule) && (
          <Block title="Sugestão">
            <p className="text-sm leading-relaxed text-ink">{analysis.suggestion}</p>
            {analysis.suggestionBullets.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink-soft">
                {analysis.suggestionBullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            {analysis.suggestedRule && (
              <div className="mt-3">
                <Eyebrow>Sugestão de regra</Eyebrow>
                <blockquote className="mt-1 border-l-2 border-accent bg-accent-soft/60 px-3 py-2 font-mono text-[13px] text-ink">
                  &ldquo;{analysis.suggestedRule}&rdquo;
                </blockquote>
              </div>
            )}
          </Block>
        )}

        <Block title="Impacto estimado">
          <div className="flex flex-wrap items-center gap-2">
            <ImpactPill level={analysis.impact} />
            <span className="text-[13px] text-ink-faint">
              {IMPACT_LABELS[analysis.impact]}: {analysis.impactReason}.
            </span>
          </div>
        </Block>
      </CardBody>
    </Card>
  );
}

function Block({ title, tone = "faint", children }: { title: string; tone?: "faint" | "warn" | "added"; children: React.ReactNode }) {
  return (
    <section>
      <Eyebrow tone={tone} className="mb-1.5">
        {title}
      </Eyebrow>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-ink-faint">{children}</p>;
}

function RuleList({ rules, muted }: { rules: RuleRef[]; muted?: boolean }) {
  return (
    <ul className="space-y-1.5">
      {rules.map((r, i) => (
        <li key={`${r.line}-${i}`} className="flex gap-2 text-[13px]">
          <span className="w-12 shrink-0 pt-px text-right font-mono text-[11px] text-ink-faint">L{r.line + 1}</span>
          <span className="min-w-0">
            <span className={muted ? "text-ink-soft" : "text-ink"}>&ldquo;{r.text}&rdquo;</span>
            <span className="ml-1.5 text-[11px] text-ink-faint">{r.section}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
