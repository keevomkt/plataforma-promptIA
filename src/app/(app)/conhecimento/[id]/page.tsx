import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/data";
import { listBusinessUnits } from "@/lib/knowledge/data";
import { Card, CardBody, CardHeader, CurrentTag } from "@/components/ui/Surfaces";
import { KnowledgeMetaForm } from "@/components/knowledge/KnowledgeMetaForm";
import { KnowledgeReplace } from "@/components/knowledge/KnowledgeReplace";
import { MAX_FILE_MB } from "@/lib/knowledge/extract";
import { KnowledgeRevisionActions } from "@/components/knowledge/KnowledgeRevisionActions";
import { countWords, formatCount } from "@/lib/tokens";

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function KnowledgeDocumentPage({ params }: { params: { id: string } }) {
  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id: params.id },
    include: {
      revisions: {
        orderBy: { revision: "desc" },
        select: { id: true, revision: true, fileName: true, size: true, note: true, createdAt: true, createdBy: true },
      },
    },
  });
  if (!doc) notFound();
  const current = await prisma.knowledgeRevision.findUnique({
    where: { documentId_revision: { documentId: doc.id, revision: doc.currentRevision } },
    select: { content: true, fileName: true },
  });
  const units = await listBusinessUnits();

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-6 py-6">
      <Link href="/conhecimento" className="text-xs font-medium text-ink-faint hover:text-ink-soft">
        ← Base de conhecimento
      </Link>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <KnowledgeMetaForm
            id={doc.id}
            units={units}
            initial={{ title: doc.title, businessUnit: doc.businessUnit, category: doc.category, description: doc.description ?? "" }}
          />

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink">Texto extraído — revisão {doc.currentRevision}</span>
              <span className="flex items-center gap-3 text-xs text-ink-faint">
                {current && `${formatCount(countWords(current.content))} palavras`}
                <a href={`/api/conhecimento/${doc.id}/arquivo?formato=texto`} className="font-medium text-accent hover:underline">
                  baixar .txt
                </a>
              </span>
            </CardHeader>
            <CardBody className="p-0">
              <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[12.5px] leading-relaxed text-ink-soft">
                {current?.content ?? "—"}
              </pre>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <KnowledgeReplace id={doc.id} maxMb={MAX_FILE_MB} />

          <Card>
            <CardHeader>
              <span className="text-sm font-medium text-ink">Revisões do arquivo</span>
            </CardHeader>
            <CardBody className="space-y-3">
              {doc.revisions.map((r) => (
                <div key={r.id} className="space-y-1 border-b border-line pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold text-ink">rev. {r.revision}</span>
                    {r.revision === doc.currentRevision && <CurrentTag />}
                  </div>
                  <p className="truncate text-[12.5px] text-ink-soft" title={r.fileName}>
                    {r.fileName} · {formatSize(r.size)}
                  </p>
                  {r.note && <p className="text-[12px] text-ink-soft">&ldquo;{r.note}&rdquo;</p>}
                  <p className="text-[11.5px] text-ink-faint">
                    {formatDateTime(r.createdAt)} · {r.createdBy}
                  </p>
                  <KnowledgeRevisionActions id={doc.id} revision={r.revision} isCurrent={r.revision === doc.currentRevision} />
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
