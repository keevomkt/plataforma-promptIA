import Link from "next/link";
import { formatDateTime } from "@/lib/data";
import { listBusinessUnits, listKnowledgeDocuments, loadKnowledgeSources } from "@/lib/knowledge/data";
import { KnowledgeIndex } from "@/lib/engine/knowledge";
import { stems } from "@/lib/engine/text";
import { KNOWLEDGE_CATEGORIES } from "@/lib/engine/types";
import { KnowledgeUpload } from "@/components/knowledge/KnowledgeUpload";
import { MAX_FILE_MB } from "@/lib/knowledge/extract";
import { KnowledgeFilters } from "@/components/knowledge/KnowledgeFilters";
import { Card, CardBody, Eyebrow, Pill } from "@/components/ui/Surfaces";
import { UnitLogo } from "@/components/Brand";
import { resolveUnit } from "@/lib/brand";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function KnowledgePage({ searchParams }: { searchParams: { q?: string; unidade?: string; categoria?: string } }) {
  const [docs, units] = await Promise.all([listKnowledgeDocuments(), listBusinessUnits()]);
  const q = searchParams.q?.trim() ?? "";
  const filtered = docs.filter(
    (d) => (!searchParams.unidade || d.businessUnit === searchParams.unidade) && (!searchParams.categoria || d.category === searchParams.categoria)
  );

  // Busca no conteúdo dos documentos, com o mesmo critério usado na análise das alterações
  let results: ReturnType<KnowledgeIndex["search"]> = [];
  if (q) {
    const ids = new Set(filtered.map((d) => d.id));
    const sources = (await loadKnowledgeSources()).filter((s) => ids.has(s.documentId));
    results = new KnowledgeIndex(sources).search(Array.from(new Set(stems(q))), 20);
  }

  const groups = new Map<string, typeof filtered>();
  for (const d of filtered) groups.set(d.businessUnit, [...(groups.get(d.businessUnit) ?? []), d]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">Base de conhecimento</h1>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">
          Documentos de referência da empresa: produtos de cada unidade de negócio, informações institucionais, termos e
          regras comerciais. A plataforma consulta esta base ao analisar cada alteração de prompt e ao validar a nova versão —
          mostrando os trechos relacionados e avisando quando o prompt cita algo que não tem fonte aqui.
        </p>
      </div>

      <KnowledgeUpload units={units} maxMb={MAX_FILE_MB} />

      <KnowledgeFilters units={units} />

      {q && (
        <section>
          <Eyebrow className="mb-2">
            Trechos encontrados para &ldquo;{q}&rdquo; ({results.length})
          </Eyebrow>
          {!results.length && <p className="text-sm text-ink-faint">Nenhum trecho relacionado.</p>}
          <div className="space-y-2">
            {results.map((r) => (
              <Link key={r.documentId} href={`/conhecimento/${r.documentId}`} className="block">
                <Card className="hover:border-line-strong">
                  <CardBody className="space-y-1 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-medium text-ink">{r.title}</span>
                      <UnitLogo unit={r.businessUnit} height={18} />
                      <span className="text-[11px] text-ink-faint">{KNOWLEDGE_CATEGORIES[r.category]}</span>
                    </div>
                    <p className="whitespace-pre-line text-[12.5px] text-ink-soft">{r.excerpt}</p>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!docs.length ? (
        <p className="rounded border border-dashed border-line px-4 py-6 text-center text-sm text-ink-faint">
          Nenhum documento ainda. Envie os arquivos acima (PDF, Word, TXT, Markdown, CSV ou JSON).
        </p>
      ) : (
        <div className="space-y-5">
          {Array.from(groups.entries()).map(([unit, items]) => (
            <section key={unit}>
              <div className="mb-2 flex items-center gap-2">
                <UnitLogo unit={unit} height={22} />
                <Eyebrow>
                  {unit}
                  {resolveUnit(unit) ? ` · ${resolveUnit(unit)!.brand}` : ""} · {items.length} documento(s)
                </Eyebrow>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {items.map((d) => (
                  <Link key={d.id} href={`/conhecimento/${d.id}`} className="block">
                    <Card className="h-full hover:border-line-strong">
                      <CardBody className="space-y-1 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[13.5px] font-medium text-ink">{d.title}</span>
                          <Pill tone="accent" className="shrink-0">
                            {KNOWLEDGE_CATEGORIES[d.category] ?? d.category}
                          </Pill>
                        </div>
                        {d.description && <p className="line-clamp-2 text-[12.5px] text-ink-soft">{d.description}</p>}
                        {d.current && (
                          <p className="text-[11.5px] text-ink-faint">
                            {d.current.fileName} · {formatSize(d.current.size)} · rev. {d.currentRevision}
                            {d.revisionCount > 1 ? ` de ${d.revisionCount}` : ""} · {formatDateTime(d.current.createdAt)} · {d.current.createdBy}
                          </p>
                        )}
                      </CardBody>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ))}
          {!filtered.length && <p className="text-sm text-ink-faint">Nenhum documento com esses filtros.</p>}
        </div>
      )}
    </div>
  );
}
