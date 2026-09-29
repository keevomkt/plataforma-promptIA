import Link from "next/link";
import { getPromptBySlug, getVersion, listVersions } from "@/lib/data";
import { RuleDiffView } from "@/components/change/RuleDiffView";
import { ComparePicker } from "@/components/ComparePicker";

export default async function ComparePage({ params, searchParams }: { params: { slug: string }; searchParams: { de?: string; para?: string } }) {
  const prompt = await getPromptBySlug(params.slug);
  const versions = await listVersions(prompt.id);
  const from = searchParams.de ? await getVersion(prompt.id, searchParams.de) : versions[1];
  const to = searchParams.para ? await getVersion(prompt.id, searchParams.para) : versions[0];

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/p/${prompt.slug}/historico`} className="text-xs font-medium text-ink-faint hover:text-ink-soft">
          ← Histórico
        </Link>
        <ComparePicker slug={prompt.slug} versions={versions.map((v) => ({ id: v.id, version: v.version }))} initialFrom={from?.id} initialTo={to?.id} />
      </div>
      {from && to ? (
        <>
          <RuleDiffView previous={from.content} next={to.content} title={`Comparação: v${from.version} → v${to.version}`} />
          {(from.temperature !== to.temperature || from.topP !== to.topP) && (
            <p className="rounded border border-line bg-surface px-4 py-2 text-sm text-ink-soft">
              Parâmetros: Temperatura <span className="font-mono">{from.temperature} → {to.temperature}</span> · Top P{" "}
              <span className="font-mono">{from.topP} → {to.topP}</span>
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-faint">É preciso ter ao menos duas versões para comparar.</p>
      )}
    </div>
  );
}
