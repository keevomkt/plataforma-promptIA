import Link from "next/link";
import { getCurrentVersion, getPromptBySlug } from "@/lib/data";
import { isRuleLine, parsePrompt } from "@/lib/engine/parse";
import { locateBehavior } from "@/lib/engine/locate";
import { AskPromptResult } from "@/components/ask/AskPromptResult";
import { Card, CardBody, Eyebrow } from "@/components/ui/Surfaces";

/**
 * Consulta ao que o prompt já diz. Não grava nada: a pergunta vai no
 * endereço (?q=), então o resultado pode ser recarregado e compartilhado.
 */
export default async function AskPage({ params, searchParams }: { params: { slug: string }; searchParams: { q?: string } }) {
  const prompt = await getPromptBySlug(params.slug);
  const current = await getCurrentVersion(prompt.id);
  const q = (searchParams.q ?? "").trim().slice(0, 500);
  const base = `/p/${prompt.slug}/perguntar`;

  if (!current) {
    return <p className="mx-auto max-w-3xl px-6 py-6 text-sm text-ink-soft">Este prompt ainda não tem nenhuma versão.</p>;
  }

  const parsed = parsePrompt(current.content);
  const result = q ? locateBehavior(parsed, q) : null;

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
              Tire dúvidas sobre o que o prompt já diz. Nada é alterado: aqui só aparecem trechos que existem no prompt (v{current.version}).
            </p>
          </div>
          <form method="get" action={base} className="space-y-2">
            <textarea
              name="q"
              defaultValue={q}
              rows={2}
              required
              maxLength={500}
              placeholder="Escreva sua dúvida sobre o comportamento da IA"
              className="w-full resize-y rounded border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-accent"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <Link
                    key={s}
                    href={`${base}?q=${encodeURIComponent(s)}`}
                    className="rounded-sm border border-line bg-sunken px-2 py-1 text-[12px] text-ink-soft hover:border-accent hover:text-ink"
                  >
                    {s}
                  </Link>
                ))}
              </div>
              <button type="submit" className="rounded bg-accent px-4 py-1.5 text-[13px] font-medium text-white hover:bg-accent-strong">
                Perguntar
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      {result && <AskPromptResult result={result} slug={prompt.slug} version={current.version} />}
    </div>
  );
}
