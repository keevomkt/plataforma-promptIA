import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateTime, getCurrentVersion, getPromptBySlug, getVersion } from "@/lib/data";
import { Card, CardBody, CardHeader, CurrentTag } from "@/components/ui/Surfaces";
import { VersionActions } from "@/components/VersionActions";
import { RuleDiffView } from "@/components/change/RuleDiffView";
import { estimateTokens, formatCount } from "@/lib/tokens";

export default async function VersionPage({ params }: { params: { slug: string; versionId: string } }) {
  const prompt = await getPromptBySlug(params.slug);
  const version = await getVersion(prompt.id, params.versionId);
  const current = await getCurrentVersion(prompt.id);
  const parent = version.parentVersionId ? await prisma.promptVersion.findUnique({ where: { id: version.parentVersionId } }) : null;
  const change = await prisma.changeRequest.findFirst({ where: { toVersionId: version.id } });
  const isCurrent = current?.id === version.id;

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-6 py-6">
      <Link href={`/p/${prompt.slug}/historico`} className="text-xs font-medium text-ink-faint hover:text-ink-soft">
        ← Histórico
      </Link>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-semibold text-ink">v{version.version}</span>
            {isCurrent && <CurrentTag />}
          </div>
          <VersionActions slug={prompt.slug} versionId={version.id} version={version.version} isCurrent={isCurrent} currentId={current?.id} promptName={prompt.name} />
        </CardHeader>
        <CardBody className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Meta label="Alteração" value={version.changeDescription || "Sem descrição"} wide />
          <Meta label="Data" value={formatDateTime(version.createdAt)} />
          <Meta label="Responsável" value={version.createdBy} />
          <Meta label="Temperatura" value={String(version.temperature)} mono />
          <Meta label="Top P" value={String(version.topP)} mono />
          <Meta label="Tamanho" value={`${formatCount(version.content.length)} caracteres · ~${formatCount(estimateTokens(version.content))} tokens`} wide />
          {change && ["PEDIDO", "MANUAL", "DIAGNOSTICO"].includes(change.kind) && (
            <div className="col-span-2 sm:col-span-4">
              <Link href={`/p/${prompt.slug}/alterar/${change.id}`} className="text-xs font-medium text-accent hover:underline">
                Ver a análise e a validação desta alteração →
              </Link>
            </div>
          )}
        </CardBody>
      </Card>

      {parent && parent.content !== version.content && (
        <RuleDiffView previous={parent.content} next={version.content} title={`Comparação: v${parent.version} → v${version.version}`} />
      )}

      <Card>
        <CardHeader>
          <span className="text-sm font-medium text-ink">Prompt completo — v{version.version}</span>
        </CardHeader>
        <CardBody className="p-0">
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[12.5px] leading-relaxed text-ink-soft">
            {version.content}
          </pre>
        </CardBody>
      </Card>
    </div>
  );
}

function Meta({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={mono ? "font-mono text-ink" : "text-ink"}>{value}</div>
    </div>
  );
}
