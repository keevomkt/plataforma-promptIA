import Link from "next/link";
import { Card, CardBody, Eyebrow, Pill } from "@/components/ui/Surfaces";
import { UnitLogo } from "@/components/Brand";
import type { KnowledgeAnswer } from "@/lib/engine/locate";

/** Documentos da base de conhecimento que tratam do assunto: trechos literais, nunca texto gerado. */
export function KnowledgeResultView({ answer, label }: { answer: KnowledgeAnswer; label: string }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <div>
          <Eyebrow>{label}</Eyebrow>
          <p className="text-[12.5px] text-ink-faint">
            {answer.docs.length} de {answer.consulted} documento(s) consultados ({answer.scope}){" "}
            {answer.items ? "citam algum destes itens" : <>citam &ldquo;{answer.topic}&rdquo;</>}. Trechos copiados dos documentos.
          </p>
        </div>
        {!!answer.interpretation?.length && (
          <div className="rounded border border-accent/20 bg-accent-soft/50 px-3 py-2 text-[12.5px] text-accent-strong">
            <span className="font-semibold">Como entendi a pergunta: </span>
            {answer.interpretation.join(" ")}
          </div>
        )}
        <ul className="divide-y divide-line">
          {answer.docs.map((d) => (
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
                  {d.occurrences} {d.occurrences === 1 ? "ocorrência" : "ocorrências"}
                </Pill>
                {answer.items && (
                  <span className="text-[12px] text-ink-soft">
                    cita: <span className="font-medium text-ink">{d.matched.join(", ")}</span>
                  </span>
                )}
                {Object.entries(d.forms).map(([form, n]) => (
                  <span key={form} className="rounded-sm bg-sunken px-1.5 py-px text-[11px] text-ink-faint">
                    escrito como <span className="font-mono text-ink-soft">{form}</span> ×{n}
                  </span>
                ))}
              </div>
              <ul className="mt-2 space-y-1.5">
                {d.excerpts.map((e, i) => (
                  <li key={i}>
                    <blockquote className="border-l-2 border-accent/40 pl-3 text-[13px] leading-relaxed text-ink-soft">
                      <Highlight text={e.text} forms={e.forms} />
                    </blockquote>
                    {e.forms.length > 0 && (
                      <p className="pl-3 text-[11px] text-ink-faint">
                        grafia encontrada: {e.forms.map((f) => `“${f}”`).join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
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
