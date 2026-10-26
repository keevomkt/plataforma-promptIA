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
import { Tabs } from "@/components/ui/Tabs";
import { UnitLogo } from "@/components/Brand";
import { BUSINESS_UNITS, resolveUnit, type BusinessUnitId } from "@/lib/brand";
import { GENERAL_TAB as GENERAL, knowledgeTab as tabOf } from "@/lib/knowledge/tabs";
import { requireUser } from "@/lib/auth/session";

// Abas na mesma ordem da barra lateral; a primeira abre por padrão
const UNIT_TABS: BusinessUnitId[] = ["HCM", "EC", "ERP", "3UN"];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function KnowledgePage({ searchParams }: { searchParams: { q?: string; unidade?: string; categoria?: string } }) {
  const [user, docs, units] = await Promise.all([requireUser(), listKnowledgeDocuments(), listBusinessUnits()]);
  // Quem não é administrador só consulta: sem envio de arquivos
  const canEdit = user.role === "ADMIN";
  const q = searchParams.q?.trim() ?? "";
  const requested = searchParams.unidade?.toUpperCase();
  const tab = requested === GENERAL ? GENERAL : resolveUnit(requested)?.id ?? UNIT_TABS[0];
  const tabLabel = tab === GENERAL ? "Geral" : tab === "HCM" ? "eKeep" : tab;

  const inTab = docs.filter((d) => tabOf(d.businessUnit) === tab);
  const filtered = inTab.filter((d) => !searchParams.categoria || d.category === searchParams.categoria);

  // Busca no conteúdo, só entre os documentos da aba (mesmo critério usado na análise das alterações)
  let results: ReturnType<KnowledgeIndex["search"]> = [];
  if (q) {
    const ids = new Set(filtered.map((d) => d.id));
    const sources = (await loadKnowledgeSources()).filter((s) => ids.has(s.documentId));
    results = new KnowledgeIndex(sources).search(Array.from(new Set(stems(q))), 20);
  }

  // Grupos por categoria, na ordem da lista de categorias
  const order = Object.keys(KNOWLEDGE_CATEGORIES);
  const groups = new Map<string, typeof filtered>();
  for (const d of filtered) groups.set(d.category, [...(groups.get(d.category) ?? []), d]);
  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));

  // Abas: as quatro unidades sempre; "Geral" só quando tem documento (ou está aberta)
  const hasGeneral = docs.some((d) => tabOf(d.businessUnit) === GENERAL);
  const href = (id: string) => {
    const params = new URLSearchParams({ unidade: id });
    if (q) params.set("q", q);
    if (searchParams.categoria) params.set("categoria", searchParams.categoria);
    return `/conhecimento?${params.toString()}`;
  };
  const tabs = [
    ...UNIT_TABS.map((id) => ({
      href: href(id),
      label: id === "HCM" ? `${BUSINESS_UNITS[id].brand} (${id})` : id,
      active: tab === id,
      icon: <UnitLogo unit={id} height={18} />,
      count: docs.filter((d) => tabOf(d.businessUnit) === id).length,
    })),
    ...(hasGeneral || tab === GENERAL
      ? [{ href: href(GENERAL), label: "Geral", active: tab === GENERAL, count: docs.filter((d) => tabOf(d.businessUnit) === GENERAL).length }]
      : []),
  ];

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

      <Tabs tabs={tabs} className="border-b border-line" />

      {canEdit && <KnowledgeUpload units={units} maxMb={MAX_FILE_MB} tab={tab} />}

      <KnowledgeFilters unitLabel={tabLabel} />

      {q && (
        <section>
          <Eyebrow className="mb-2">
            Trechos encontrados em {tabLabel} para &ldquo;{q}&rdquo; ({results.length})
          </Eyebrow>
          {!results.length && <p className="text-sm text-ink-faint">Nenhum trecho relacionado nesta unidade.</p>}
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

      {!inTab.length ? (
        <p className="rounded border border-dashed border-line px-4 py-6 text-center text-sm text-ink-faint">
          Nenhum documento nesta unidade ainda.
          {canEdit && <> Envie os arquivos acima: a unidade {tab === GENERAL ? "é a que você digitar" : `${tabLabel} já vem marcada`}.</>}
        </p>
      ) : !filtered.length ? (
        <p className="text-sm text-ink-faint">Nenhum documento de {tabLabel} nessa categoria.</p>
      ) : (
        <div className="space-y-6">
          {sortedGroups.map(([category, items]) => (
            <section key={category}>
              <div className="mb-2.5 flex items-center gap-2.5">
                <Pill tone="accent" className="shrink-0 font-semibold">
                  {KNOWLEDGE_CATEGORIES[category] ?? category}
                </Pill>
                <span className="shrink-0 text-[12px] text-ink-faint">{items.length} documento(s)</span>
                <span className="h-px flex-1 bg-line-strong" />
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {items.map((d) => (
                  <Link key={d.id} href={`/conhecimento/${d.id}`} className="block">
                    <Card className="h-full hover:border-line-strong">
                      <CardBody className="space-y-1 py-2.5">
                        <span className="block text-[13.5px] font-medium text-ink">{d.title}</span>
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
        </div>
      )}
    </div>
  );
}
