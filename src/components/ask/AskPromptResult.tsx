import Link from "next/link";
import { Card, CardBody, Eyebrow, Pill } from "@/components/ui/Surfaces";
import type { BehaviorGroup, LocatedRule, LocateResult, MatchReason, OverlapFinding } from "@/lib/engine/locate";

const L = (line: number) => `L${line + 1}`;

export function AskPromptResult({ result, slug, version, showSource = true }: { result: LocateResult; slug: string; version: number; showSource?: boolean }) {
  const allGroups = [...result.sectionHits.flatMap((h) => h.groups), ...result.groups];
  const ruleText = new Map(allGroups.flatMap((g) => g.rules.map((r) => [r.line, r.text] as const)));
  const overlaps = dedupeOverlaps(allGroups.flatMap((g) => g.overlaps));
  const [main, ...others] = result.groups;
  const hasHits = result.sectionHits.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-faint">
        {showSource && (
          <>
            <span>Fonte consultada:</span>
            <Pill tone="accent">Prompt v{version}</Pill>
          </>
        )}
        {result.topic.display && (
          <span>
            {showSource && "· "}assunto entendido: <span className="text-ink-soft">&ldquo;{result.topic.display}&rdquo;</span>
          </span>
        )}
      </div>

      {!result.found && (
        <Card>
          <CardBody className="space-y-1.5">
            <p className="text-[15px] text-ink">
              Não encontrei no prompt nenhuma regra sobre &ldquo;{result.topic.display || "esse assunto"}&rdquo;.
            </p>
            {result.topic.missing.length > 0 && (
              <p className="text-[13px] text-ink-soft">
                {result.topic.missing.length === 1 ? "A palavra" : "As palavras"} {result.topic.missing.map((w) => `“${w}”`).join(", ")}{" "}
                {result.topic.missing.length === 1 ? "não aparece" : "não aparecem"} em nenhum lugar do prompt.
              </p>
            )}
            <p className="text-[12.5px] text-ink-faint">Tente com as palavras que o próprio prompt usa para esse assunto.</p>
          </CardBody>
        </Card>
      )}

      {overlaps.length > 0 && (
        <div className="space-y-2 rounded border border-warn-border bg-warn-bg/60 px-4 py-3">
          <Eyebrow tone="warn">Atenção: regras que se repetem ou divergem</Eyebrow>
          {overlaps.map((o, i) => (
            <div key={i} className="text-[13px]">
              <p className="font-medium text-warn">
                {o.kind === "duplicidade" ? "Possível duplicidade" : "Possível divergência"}: {o.explanation}
              </p>
              <ul className="mt-1 space-y-0.5">
                {o.lines.map((l) => (
                  <li key={l} className="flex gap-2 text-ink-soft">
                    <span className="w-11 shrink-0 text-right font-mono text-[11px] text-ink-faint">{L(l)}</span>
                    <span>{ruleText.get(l)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {result.sectionHits.map((hit) => (
        <Card key={hit.headingLine}>
          <CardBody className="space-y-4">
            <div>
              <Eyebrow>Seção que trata do assunto</Eyebrow>
              <p className="mt-0.5 text-[16px] font-medium text-ink">{hit.path.join(" › ")}</p>
              <p className="text-[12.5px] text-ink-faint">
                {hit.groups.length} {hit.groups.length === 1 ? "parte" : "partes"}, cada uma é um comportamento:
              </p>
            </div>
            {hit.groups.map((g) => (
              <GroupBlock key={g.id} group={g} slug={slug} nested />
            ))}
          </CardBody>
        </Card>
      ))}

      {main && (
        <Card>
          <CardBody className="space-y-3">
            <Eyebrow>{hasHits ? "Outras regras que citam o assunto" : "Regras encontradas"}</Eyebrow>
            <GroupBlock group={main} slug={slug} />
          </CardBody>
        </Card>
      )}

      {others.length > 0 && (
        <details className="group rounded border border-line bg-surface shadow-panel" open={!hasHits && others.length <= 2}>
          <summary className="cursor-pointer list-none px-4 py-3">
            <Eyebrow className="inline">
              {hasHits ? "Mais" : "Também citam o assunto"} ({others.length} {others.length === 1 ? "trecho" : "trechos"})
            </Eyebrow>
            <span className="ml-1.5 text-[11px] text-ink-faint group-open:hidden">mostrar</span>
          </summary>
          <div className="space-y-4 border-t border-line px-4 py-3.5">
            {others.map((g) => (
              <GroupBlock key={g.id} group={g} slug={slug} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function GroupBlock({ group, slug, nested }: { group: BehaviorGroup; slug: string; nested?: boolean }) {
  const range = group.firstLine === group.lastLine ? L(group.firstLine) : `${L(group.firstLine)}–${L(group.lastLine)}`;
  const path = group.sectionPath.join(" › ");
  const pedido = `Nas regras ${range} (${group.title}): `;
  return (
    <section className={nested ? "rounded border border-line px-3 py-2.5" : ""}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <span className="text-[14px] font-medium text-ink">{group.title}</span>
          <span className="ml-2 font-mono text-[11px] text-ink-faint">{range}</span>
          {path && path !== group.title && <p className="text-[11.5px] text-ink-faint">{path}</p>}
        </div>
        <Link href={`/p/${slug}/alterar?pedido=${encodeURIComponent(pedido)}`} className="shrink-0 text-[12px] text-accent hover:underline">
          Usar como base para uma alteração →
        </Link>
      </div>
      <ul className="space-y-2">
        {group.rules.map((r) => (
          <RuleRow key={r.line} rule={r} />
        ))}
      </ul>
    </section>
  );
}

function RuleRow({ rule }: { rule: LocatedRule }) {
  return (
    <li className="flex gap-2 text-[13.5px]">
      <span className="w-11 shrink-0 pt-0.5 text-right font-mono text-[11px] text-ink-faint">{L(rule.line)}</span>
      <div className="min-w-0">
        <p className="whitespace-pre-wrap leading-relaxed text-ink">{rule.text}</p>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {/* "na seção X" repete o título do grupo: não é mostrado */}
          {rule.reasons.filter((r) => r.kind !== "secao").map((r, i) => (
            <span key={i} className="rounded-sm bg-sunken px-1.5 py-px text-[10.5px] text-ink-faint">
              {reasonLabel(r)}
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}

function reasonLabel(r: MatchReason): string {
  switch (r.kind) {
    case "termo":
      return `cita ${r.terms.map((t) => `“${t}”`).join(", ")}`;
    case "secao":
      return `na seção “${r.section}”`;
    case "estrutura":
      return `parte do item ${L(r.headLine)}`;
    case "referencia":
      return `retoma ${L(r.antecedentLine)} (“${r.marker}”)`;
    case "posicao":
      return `entre ${L(r.before)} e ${L(r.after)}`;
  }
}

function dedupeOverlaps(list: OverlapFinding[]): OverlapFinding[] {
  const seen = new Set<string>();
  return list.filter((o) => {
    const k = `${o.kind}:${[...o.lines].sort((a, b) => a - b).join(",")}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
