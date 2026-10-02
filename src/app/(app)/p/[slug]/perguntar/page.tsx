import { getCurrentVersion, getPromptBySlug } from "@/lib/data";
import { isRuleLine, parsePrompt } from "@/lib/engine/parse";
import { answerQuestion } from "@/lib/engine/locate";
import { loadKnowledgeForPrompt } from "@/lib/knowledge/data";
import { AskPromptResult, GroupBlock } from "@/components/ask/AskPromptResult";
import { FactResultView } from "@/components/ask/FactResultView";
import { KnowledgeResultView } from "@/components/ask/KnowledgeResultView";
import { Card, CardBody, Eyebrow, Pill } from "@/components/ui/Surfaces";
import { AskForm } from "@/components/ask/AskForm";
import { QuestionHistory } from "@/components/ask/QuestionHistory";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/data";

/**
 * Consulta ao que o prompt e a base já dizem. Nada no prompt é alterado: a
 * pergunta vai no endereço (?q=) e fica registrada só no histórico da aba.
 */
export default async function AskPage({ params, searchParams }: { params: { slug: string }; searchParams: { q?: string } }) {
  const prompt = await getPromptBySlug(params.slug);
  const current = await getCurrentVersion(prompt.id);
  const q = (searchParams.q ?? "").trim().slice(0, 500);
  const history = await prisma.question.findMany({
    where: { promptId: prompt.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, text: true, kind: true, createdAt: true, createdBy: true },
  });

  if (!current) {
    return <p className="mx-auto max-w-3xl px-6 py-6 text-sm text-ink-soft">Este prompt ainda não tem nenhuma versão.</p>;
  }

  const parsed = parsePrompt(current.content);
  const ans = q ? answerQuestion(parsed, q, await loadKnowledgeForPrompt(prompt.id), {
        unitTerms: [prompt.slug, prompt.name, prompt.businessUnit ?? ""].filter(Boolean),
      }) : null;
  const kind = ans?.classification;
  const facts = ans?.facts;
  const result = ans?.behavior;
  const knowledge = ans?.knowledge;
  const hasDocs = !!knowledge?.docs.length;
  // A pergunta pediu documentos ou escolheu a base como fonte: a base vem primeiro
  const baseFirst = kind?.kind === "DOCUMENTOS" || !!kind?.sourceSelected;
  const twoSources = hasDocs && (!!result || !!facts);
  const aboutGroups = ans?.aboutSource ? [...ans.aboutSource.sectionHits.flatMap((h) => h.groups), ...ans.aboutSource.groups].slice(0, 2) : [];

  // Sugestões tiradas do próprio prompt: as seções com mais regras
  const suggestions = parsed.sections
    .filter((s) => s.id !== 0 && !parsed.sections.some((c) => c.parentId === s.id))
    .map((s) => ({ s, n: parsed.lines.filter((l) => l.sectionId === s.id && isRuleLine(l)).length }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map(({ s }) => `O que o prompt diz sobre “${s.title}”?`);

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-6 py-6">
      <Card>
        <CardBody className="space-y-3">
          <div>
            <Eyebrow>Perguntar ao prompt</Eyebrow>
            <p className="mt-1 text-[13px] text-ink-soft">
              Tire dúvidas sobre o que o prompt e a base de conhecimento já dizem. Nada é alterado: aqui só aparecem trechos que existem no prompt
              (v{current.version}) ou nos documentos da base.
            </p>
          </div>
          <AskForm key={q} promptId={prompt.id} initial={q} suggestions={suggestions} />
        </CardBody>
      </Card>

      {ans && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-faint">
          <span>{ans.consulted.prompt && ans.consulted.base ? "Fontes consultadas:" : "Fonte consultada:"}</span>
          {ans.consulted.prompt && <Pill tone="accent">Prompt v{current.version}</Pill>}
          {ans.consulted.prompt && ans.consulted.base && <span>+</span>}
          {ans.consulted.base && knowledge && (
            <Pill tone="accent">
              Base de conhecimento · {knowledge.consulted ? `${knowledge.consulted} documento(s)` : "sem documentos nesta unidade"}
            </Pill>
          )}
          {ans.consulted.base && knowledge && knowledge.consulted > 0 && !hasDocs && kind?.kind !== "DOCUMENTOS" && (
            <span>· nenhum documento da base trata disso</span>
          )}
        </div>
      )}

      {kind?.kind === "AMBIGUO" && (
        <p className="rounded border border-warn-border bg-warn-bg/60 px-4 py-3 text-[13px] text-warn">
          Não ficou claro se você quer uma lista de itens ou o que o prompt diz sobre o assunto ({kind.reason}). Por isso mostro os dois
          resultados: primeiro a lista, depois as regras.
        </p>
      )}

      {baseFirst && knowledge && (
        hasDocs ? (
          <KnowledgeResultView answer={knowledge} label="Documentos da base de conhecimento" />
        ) : (
          <Card>
            <CardBody>
              <p className="text-[15px] text-ink">
                {knowledge.consulted
                  ? `Nenhum dos ${knowledge.consulted} documento(s) da base de conhecimento (${knowledge.scope}) cita “${knowledge.topic}”.`
                  : "Esta unidade ainda não tem documentos na base de conhecimento."}
              </p>
            </CardBody>
          </Card>
        )
      )}

      {facts && <FactResultView result={facts} listed={kind?.listed} version={current.version} showSource={false} />}

      {result && (
        <>
          {(facts || twoSources) && <Eyebrow className="pt-2">Do prompt · como a IA se comporta</Eyebrow>}
          <AskPromptResult result={result} slug={prompt.slug} version={current.version} showSource={false} />
        </>
      )}

      {!baseFirst && hasDocs && knowledge && (
        <>
          <Eyebrow className="pt-2">Da base de conhecimento · informação de produto</Eyebrow>
          <KnowledgeResultView answer={knowledge} label="Documentos da base de conhecimento" />
        </>
      )}

      {aboutGroups.length > 0 && (
        <details className="group rounded border border-line bg-surface shadow-panel">
          <summary className="cursor-pointer list-none px-4 py-3">
            <Eyebrow className="inline">Regras do prompt sobre o uso da base de conhecimento</Eyebrow>
            <span className="ml-1.5 text-[11px] text-ink-faint group-open:hidden">mostrar</span>
            <p className="mt-0.5 text-[12px] text-ink-faint">
              Vêm do prompt: dizem como a IA deve usar a base, não são o conteúdo dos documentos.
            </p>
          </summary>
          <div className="space-y-4 border-t border-line px-4 py-3.5">
            {aboutGroups.map((g) => (
              <GroupBlock key={g.id} group={g} slug={prompt.slug} />
            ))}
          </div>
        </details>
      )}

      <QuestionHistory
        slug={prompt.slug}
        current={q}
        items={history.map((h) => ({ id: h.id, text: h.text, kind: h.kind, when: formatDateTime(h.createdAt), createdBy: h.createdBy }))}
      />
    </div>
  );
}
