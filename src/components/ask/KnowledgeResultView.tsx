import Link from "next/link";
import { Card, CardBody, Eyebrow, Pill } from "@/components/ui/Surfaces";
import { UnitLogo } from "@/components/Brand";
import type { CategoryItem, KnowledgeAnswer, KnowledgeDocHit } from "@/lib/engine/locate";

/** Documentos da base de conhecimento que tratam do assunto: trechos literais, nunca texto gerado. */
export function KnowledgeResultView({ answer, label }: { answer: KnowledgeAnswer; label: string }) {
  const groups = answer.itemGroups;
  const main = groups?.main ?? [];
  const other = groups?.other ?? [];
  const otherDocs = answer.otherDocs ?? [];
  return (
    <Card>
      <CardBody className="space-y-3">
        <div>
          <Eyebrow>{label}</Eyebrow>
          <p className="text-[12.5px] text-ink-faint">
            {answer.docs.length} de {answer.consulted} documento(s) consultados ({answer.scope}){" "}
            {groups ? "citam algum dos itens do prompt" : answer.items ? "citam algum destes itens" : <>citam &ldquo;{answer.topic}&rdquo;</>}.
          </p>
        </div>
        {!!answer.interpretation?.length && (
          <div className="rounded border border-accent/20 bg-accent-soft/50 px-3 py-2 text-[12.5px] text-accent-strong">
            <span className="font-semibold">Como entendi a pergunta: </span>
            {answer.interpretation.join(" ")}
          </div>
        )}
        {groups && (
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-ink-faint">Itens do prompt:</span>
            {main.map((i) => (
              <ItemChip key={i.name} item={i} />
            ))}
          </div>
        )}
        <DocList docs={answer.docs} groups={groups} />

        {groups && other.length > 0 && (
          <details className="group rounded border border-line">
            <summary className="cursor-pointer list-none px-3 py-2 text-[12.5px] text-ink-soft">
              Também citados no prompt ({other.length} {other.length === 1 ? "termo" : "termos"}
              {otherDocs.length ? `; ${otherDocs.length} documento(s) só com eles` : ""}){" "}
              <span className="text-[11px] text-ink-faint group-open:hidden">mostrar</span>
            </summary>
            <div className="space-y-2 border-t border-line px-3 py-2.5">
              <p className="text-[12px] text-ink-faint">
                Termos que o prompt cita sem seção própria e fora da lista dos itens acima. Os de baixa confiança podem ser termos genéricos
                (sigla, nome de área), não produtos.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {other.map((i) => (
                  <ItemChip key={i.name} item={i} muted />
                ))}
              </div>
              {otherDocs.length > 0 && <DocList docs={otherDocs} groups={groups} />}
            </div>
          </details>
        )}
      </CardBody>
    </Card>
  );
}

function ItemChip({ item, muted, count }: { item: CategoryItem; muted?: boolean; count?: number }) {
  return (
    <span
      className={
        muted || item.confidence === "baixa"
          ? "inline-flex items-center gap-1 rounded-sm border border-line bg-sunken px-1.5 py-px text-[11.5px] text-ink-soft"
          : "inline-flex items-center gap-1 rounded-sm bg-accent-soft px-1.5 py-px text-[11.5px] font-medium text-accent-strong"
      }
    >
      {item.name}
      {count !== undefined && <span className="font-mono">×{count}</span>}
      {item.confidence === "baixa" && <span className="rounded-sm bg-warn-bg px-1 text-[10px] font-normal text-warn">baixa confiança</span>}
    </span>
  );
}

/** Num documento que cita itens do prompt, quantos "também citados" aparecem antes do "+N outros". */
const MAX_OTHER_CHIPS = 5;

function DocList({ docs, groups }: { docs: KnowledgeDocHit[]; groups?: KnowledgeAnswer["itemGroups"] }) {
  const items = groups ? [...groups.main, ...groups.other] : [];
  const mainNames = new Set(groups?.main.map((i) => i.name));
  return (
    <ul className="divide-y divide-line">
      {docs.map((d) => {
        // Por item: o que é do prompt primeiro, o "também citado" depois
        const cited = items.filter((i) => d.counts[i.name]);
        const ofMain = cited.filter((i) => mainNames.has(i.name));
        const ofOther = cited.filter((i) => !mainNames.has(i.name));
        const total = groups ? (ofMain.length ? ofMain : ofOther).reduce((n, i) => n + d.counts[i.name], 0) : d.occurrences;
        // Grafia diferente do nome buscado (ex.: "NGEssence" para "NG Essence")
        const variants = (ofMain.length ? ofMain : ofOther).flatMap((i) =>
          (d.itemForms[i.name] ?? []).filter((f) => f !== i.name).map((f) => ({ item: i.name, form: f }))
        );
        return (
          <li key={d.documentId} className="py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[15px]" aria-hidden>
                📄
              </span>
              <Link href={`/conhecimento/${d.documentId}`} className="text-[15px] font-semibold text-ink hover:text-accent hover:underline">
                {d.title}
              </Link>
              <UnitLogo unit={d.businessUnit} height={18} />
              <Pill tone="accent">
                {total} {total === 1 ? "ocorrência" : "ocorrências"}
              </Pill>
            </div>
            {groups ? (
              <div className="mt-1.5 space-y-1">
                {ofMain.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] text-ink-faint">cita:</span>
                    {ofMain.map((i) => (
                      <ItemChip key={i.name} item={i} count={d.counts[i.name]} />
                    ))}
                  </div>
                )}
                {ofOther.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] text-ink-faint">{ofMain.length ? "também cita:" : "cita:"}</span>
                    {ofOther.slice(0, ofMain.length ? MAX_OTHER_CHIPS : undefined).map((i) => (
                      <ItemChip key={i.name} item={i} count={d.counts[i.name]} muted />
                    ))}
                    {ofMain.length > 0 && ofOther.length > MAX_OTHER_CHIPS && (
                      <span
                        className="text-[11.5px] text-ink-faint"
                        title={ofOther
                          .slice(MAX_OTHER_CHIPS)
                          .map((i) => `${i.name} ×${d.counts[i.name]}${i.confidence === "baixa" ? " (baixa confiança)" : ""}`)
                          .join(", ")}
                      >
                        +{ofOther.length - MAX_OTHER_CHIPS} outros
                      </span>
                    )}
                  </div>
                )}
                {variants.length > 0 && (
                  <p className="text-[11px] text-ink-faint">
                    escrito como{" "}
                    {variants.map((v, k) => (
                      <span key={k}>
                        {k > 0 && ", "}
                        <span className="font-mono text-ink-soft">{v.form}</span>
                      </span>
                    ))}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {Object.entries(d.forms).map(([form, n]) => (
                  <span key={form} className="rounded-sm bg-sunken px-1.5 py-px text-[11px] text-ink-faint">
                    escrito como <span className="font-mono text-ink-soft">{form}</span> ×{n}
                  </span>
                ))}
              </div>
            )}
            <ul className="mt-2 space-y-1.5">
              {d.excerpts.map((e, i) => (
                <li key={i}>
                  <blockquote className="border-l-2 border-accent/40 pl-3 text-[13px] leading-relaxed text-ink-soft">
                    <Highlight text={e.text} forms={e.forms} />
                  </blockquote>
                  {e.forms.length > 0 && (
                    <p className="pl-3 text-[11px] text-ink-faint">grafia encontrada: {e.forms.map((f) => `“${f}”`).join(", ")}</p>
                  )}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

function Highlight({ text, forms }: { text: string; forms: string[] }) {
  if (!forms.length) return <>{text}</>;
  const re = new RegExp(`(${forms.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return (
    <>
      {text.split(re).map((part, i) =>
        forms.includes(part) ? (
          <mark key={i} className="rounded-sm bg-accent-soft px-0.5 text-accent-strong">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
