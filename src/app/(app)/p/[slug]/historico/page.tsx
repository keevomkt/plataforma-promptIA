import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime, getCurrentVersion, getPromptBySlug, listVersions, readStringList } from "@/lib/data";
import { diffStats } from "@/lib/diff";
import { Card, CardBody, CardHeader, CurrentTag, Eyebrow, ImpactPill } from "@/components/ui/Surfaces";
import { VersionActions } from "@/components/VersionActions";
import { ComparePicker } from "@/components/ComparePicker";

const KIND_LABELS: Record<string, string> = {
  PEDIDO: "Alteração solicitada",
  DIAGNOSTICO: "Diagnóstico de conversa",
  CLAUDE: "Correção do Claude",
  MANUAL: "Edição manual",
  PARAMETROS: "Parâmetros",
  RESTAURACAO: "Restauração",
  IMPORTACAO: "Importação",
};

export default async function HistoryPage({ params }: { params: { slug: string } }) {
  const prompt = await getPromptBySlug(params.slug);
  const current = await getCurrentVersion(prompt.id);
  const versions = await listVersions(prompt.id);
  const byId = new Map(versions.map((v) => [v.id, v]));
  const timeline = await prisma.changeRequest.findMany({
    where: { promptId: prompt.id, status: "VERSIONADA" },
    orderBy: { decidedAt: "desc" },
    include: { fromVersion: true, toVersion: true },
  });

  // Agrupa a linha do tempo por dia
  const days: { day: string; items: typeof timeline }[] = [];
  for (const item of timeline) {
    const day = formatDate(item.decidedAt ?? item.createdAt);
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(item);
    else days.push({ day, items: [item] });
  }

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      {/* Timeline */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Histórico de alterações</h2>
        {!days.length && <p className="text-sm text-ink-faint">Nenhuma alteração registrada.</p>}
        <div className="space-y-5">
          {days.map(({ day, items }) => (
            <div key={day}>
              <div className="mb-2 font-mono text-[12px] font-semibold text-ink-soft">{day}</div>
              <ol className="relative space-y-3 border-l border-line pl-4">
                {items.map((c) => {
                  const sections = readStringList(c.affectedSections);
                  const href = c.kind === "PEDIDO" || c.kind === "MANUAL" ? `/p/${prompt.slug}/alterar/${c.id}` : c.toVersion ? `/p/${prompt.slug}/versoes/${c.toVersion.id}` : undefined;
                  return (
                    <li key={c.id} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-accent" />
                      <Card>
                        <CardBody className="space-y-1.5 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-[13px] font-semibold text-ink">
                              {c.fromVersion ? `v${c.fromVersion.version} → ` : ""}v{c.toVersion?.version}
                            </span>
                            <span className="text-[11px] text-ink-faint">{KIND_LABELS[c.kind] ?? c.kind}</span>
                          </div>
                          <p className="text-[13px] text-ink">
                            <span className="text-ink-faint">Alteração: </span>&ldquo;{c.toVersion?.changeDescription ?? c.request}&rdquo;
                          </p>
                          {c.kind === "PEDIDO" && c.toVersion?.changeDescription !== c.request && (
                            <p className="text-[12px] text-ink-faint">Pedido: &ldquo;{c.request}&rdquo;</p>
                          )}
                          {c.impactLevel && (
                            <div className="flex items-center gap-1.5 text-[12px] text-ink-faint">
                              Impacto: <ImpactPill level={c.impactLevel} />
                            </div>
                          )}
                          {sections.length > 0 && (
                            <p className="text-[12px] text-ink-faint">
                              Seções: <span className="text-ink-soft">{sections.join(" · ")}</span>
                            </p>
                          )}
                          <div className="flex items-center justify-between text-[12px] text-ink-faint">
                            <span>
                              Responsável: <span className="text-ink-soft">{c.createdBy}</span> ·{" "}
                              {formatDateTime(c.decidedAt ?? c.createdAt).split(" ")[1]}
                            </span>
                            {href && (
                              <Link href={href} className="font-medium text-accent hover:underline">
                                detalhes →
                              </Link>
                            )}
                          </div>
                        </CardBody>
                      </Card>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {/* Versões */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Versões</h2>
          <ComparePicker slug={prompt.slug} versions={versions.map((v) => ({ id: v.id, version: v.version }))} />
        </div>
        {versions.map((v) => {
          const parent = v.parentVersionId ? byId.get(v.parentVersionId) : undefined;
          const stats = parent ? diffStats(parent.content, v.content) : null;
          const isCurrent = current?.id === v.id;
          return (
            <Card key={v.id} className={isCurrent ? "border-accent/60" : undefined}>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="flex items-center gap-2">
                  <Link href={`/p/${prompt.slug}/versoes/${v.id}`} className="font-mono text-sm font-semibold text-ink hover:underline">
                    v{v.version}
                  </Link>
                  {isCurrent && <CurrentTag />}
                  {stats && (stats.added > 0 || stats.removed > 0) && (
                    <span className="font-mono text-[11px]">
                      <span className="text-added">+{stats.added}</span> <span className="text-removed">−{stats.removed}</span>
                    </span>
                  )}
                </div>
                <VersionActions slug={prompt.slug} versionId={v.id} version={v.version} isCurrent={isCurrent} currentId={current?.id} promptName={prompt.name} />
              </CardHeader>
              <CardBody className="space-y-0.5 py-2.5">
                <p className="text-[13px] text-ink">{v.changeDescription || "Sem descrição"}</p>
                <p className="text-[11.5px] text-ink-faint">
                  {formatDateTime(v.createdAt)} · {v.createdBy} · Temperatura <span className="font-mono">{v.temperature}</span> · Top P{" "}
                  <span className="font-mono">{v.topP}</span>
                </p>
              </CardBody>
            </Card>
          );
        })}
        <Eyebrow className="pt-2">Toda alteração aprovada gera uma nova versão; nenhuma versão é apagada.</Eyebrow>
      </section>
    </div>
  );
}
