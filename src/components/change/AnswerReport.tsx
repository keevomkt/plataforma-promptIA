import { Card, CardBody, Eyebrow, Pill } from "@/components/ui/Surfaces";
import type { AnswerResult, KnowledgeRef } from "@/lib/engine/types";
import { KNOWLEDGE_CATEGORIES } from "@/lib/engine/types";

/**
 * Resposta a uma pergunta sobre o prompt (intenção "pergunta"). Só mostra o
 * que foi encontrado — nunca há operação, diff ou versão para uma pergunta.
 */
export function AnswerReport({ answer, knowledgeRefs }: { answer: AnswerResult; knowledgeRefs?: KnowledgeRef[] }) {
  const inPrompt = answer.promptRules.length > 0;
  const inKnowledge = (knowledgeRefs?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <Eyebrow>No prompt</Eyebrow>
          {inPrompt ? (
            <ul className="space-y-1.5">
              {answer.promptRules.map((r, i) => (
                <li key={i} className="flex gap-2 text-[13px]">
                  <span className="w-12 shrink-0 pt-px text-right font-mono text-[11px] text-ink-faint">L{r.line + 1}</span>
                  <span className="min-w-0">
                    <span className="text-ink">&ldquo;{r.text}&rdquo;</span>
                    <span className="ml-1.5 text-[11px] text-ink-faint">{r.section}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-faint">Nada encontrado no texto do prompt sobre essa pergunta.</p>
          )}
        </CardBody>
      </Card>

      {(inKnowledge || !inPrompt) && (
        <Card>
          <CardBody className="space-y-3">
            <Eyebrow>Base de conhecimento</Eyebrow>
            {inKnowledge ? (
              <ul className="space-y-2">
                {knowledgeRefs!.map((r) => (
                  <li key={r.documentId} className="rounded border border-line bg-sunken px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-medium text-ink">{r.title}</span>
                      <Pill>{r.businessUnit}</Pill>
                      <span className="text-[11px] text-ink-faint">{KNOWLEDGE_CATEGORIES[r.category] ?? r.category}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-[12.5px] text-ink-soft">{r.excerpt}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-faint">Nada encontrado na base de conhecimento sobre essa pergunta.</p>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
