import { Card, CardBody, Eyebrow, Pill } from "@/components/ui/Surfaces";
import type { FactResult, NamedItem } from "@/lib/engine/locate";

const L = (line: number) => `L${line + 1}`;

export function FactResultView({ result, listed, version }: { result: FactResult; listed?: string; version: number }) {
  const high = result.cited.filter((i) => i.confidence === "alta");
  const low = result.cited.filter((i) => i.confidence === "baixa");
  const total = result.withSection.length + result.cited.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-faint">
        <span>Fonte consultada:</span>
        <Pill tone="accent">Prompt v{version}</Pill>
        {listed && (
          <span>
            · lista pedida: <span className="text-ink-soft">&ldquo;{listed}&rdquo;</span>
          </span>
        )}
      </div>

      {total === 0 && (
        <Card>
          <CardBody>
            <p className="text-[15px] text-ink">Não encontrei no prompt nenhum item com nome próprio (produto, solução, plano…).</p>
          </CardBody>
        </Card>
      )}

      {result.withSection.length > 0 && (
        <Card>
          <CardBody className="space-y-3">
            <div>
              <Eyebrow>Com seção própria no prompt ({result.withSection.length})</Eyebrow>
              <p className="text-[12.5px] text-ink-faint">Itens que o prompt trata em uma seção dedicada.</p>
            </div>
            <ul className="divide-y divide-line">
              {result.withSection.map((i) => (
                <ItemRow key={i.name} item={i} />
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {result.cited.length > 0 && (
        <Card>
          <CardBody className="space-y-3">
            <div>
              <Eyebrow>Citados no prompt ({result.cited.length})</Eyebrow>
              <p className="text-[12.5px] text-ink-faint">Aparecem em listas ou menções, sem seção própria.</p>
            </div>
            {high.length > 0 && (
              <ul className="divide-y divide-line">
                {high.map((i) => (
                  <ItemRow key={i.name} item={i} />
                ))}
              </ul>
            )}
            {low.length > 0 && (
              <div className="rounded border border-warn-border bg-warn-bg/40 px-3 py-2.5">
                <p className="text-[12.5px] font-medium text-warn">Baixa confiança ({low.length}): podem ser termos comuns, siglas ou nomes de seção, não nomes de produto.</p>
                <ul className="mt-1.5 divide-y divide-warn-border/60">
                  {low.map((i) => (
                    <ItemRow key={i.name} item={i} compact />
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {total > 0 && (
        <p className="text-[12px] text-ink-faint">
          Lista montada a partir da estrutura do prompt (seções, listas e nomes escritos como nome próprio). Nada é gerado: o contexto de cada item é
          copiado do próprio prompt.
        </p>
      )}
    </div>
  );
}

function ItemRow({ item, compact }: { item: NamedItem; compact?: boolean }) {
  const shown = item.lines.slice(0, 8).map(L).join(" · ");
  const more = item.lines.length > 8 ? ` +${item.lines.length - 8}` : "";
  return (
    <li className={compact ? "py-1.5" : "py-2.5"}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={compact ? "text-[13px] font-medium text-ink" : "text-[15px] font-semibold text-ink"}>{item.name}</span>
        {item.confidence === "baixa" && !compact && <Pill tone="warn">baixa confiança</Pill>}
        <span className="font-mono text-[11px] text-ink-faint">
          {shown}
          {more}
        </span>
      </div>
      {item.context && !compact && (
        <blockquote className="mt-1.5 border-l-2 border-line-strong pl-3 text-[13px] text-ink-soft">
          {item.context.intro && (
            <span className="block text-ink-faint">
              <span className="mr-1.5 font-mono text-[11px]">{L(item.context.intro.line)}</span>
              {item.context.intro.text}
            </span>
          )}
          <span className="mr-1.5 font-mono text-[11px] text-ink-faint">{L(item.context.line)}</span>
          {item.context.text}
        </blockquote>
      )}
      <p className="mt-1 text-[11px] text-ink-faint">Por quê: {item.signals.join(" · ")}</p>
    </li>
  );
}
