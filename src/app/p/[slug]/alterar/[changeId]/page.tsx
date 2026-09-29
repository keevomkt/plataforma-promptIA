import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  formatDateTime,
  getChange,
  getCurrentVersion,
  getPromptBySlug,
  readAnalysis,
  readStringList,
  readValidation,
} from "@/lib/data";
import { Card, CardBody, Eyebrow, ImpactPill, Pill, StatusPill } from "@/components/ui/Surfaces";
import { GovernanceSteps } from "@/components/change/GovernanceSteps";
import { AnalysisReport } from "@/components/change/AnalysisReport";
import { ClarificationPanel } from "@/components/change/ClarificationPanel";
import { OperationsEditor } from "@/components/change/OperationsEditor";
import { RuleDiffView } from "@/components/change/RuleDiffView";
import { ValidationPanel } from "@/components/change/ValidationPanel";
import { SaveVersionPanel } from "@/components/change/SaveVersionPanel";
import { StaleBanner } from "@/components/change/StaleBanner";
import { AuditReport } from "@/components/change/AuditReport";

export default async function ChangeDetailPage({ params }: { params: { slug: string; changeId: string } }) {
  const prompt = await getPromptBySlug(params.slug);
  const change = await getChange(prompt.id, params.changeId);
  const current = await getCurrentVersion(prompt.id);
  const latest = await prisma.promptVersion.findFirst({ where: { promptId: prompt.id }, orderBy: { version: "desc" } });
  const analysis = readAnalysis(change.analysis);
  const validation = readValidation(change.validation);
  const isOpen = ["AGUARDANDO_ESCLARECIMENTO", "AGUARDANDO_APROVACAO", "APLICADA"].includes(change.status);
  const stale = isOpen && change.fromVersion && current && current.id !== change.fromVersionId;
  const isManual = change.kind === "MANUAL";
  const isDiagnosis = change.kind === "DIAGNOSTICO";

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-6 py-6">
      <Link href={`/p/${prompt.slug}/alterar`} className="text-xs font-medium text-ink-faint hover:text-ink-soft">
        ← Alterar prompt
      </Link>

      {/* Solicitação recebida */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Eyebrow>{isManual ? "Edição manual" : isDiagnosis ? "Diagnóstico de conversa" : analysis?.audit ? "Revisão do prompt" : "Solicitação recebida"}</Eyebrow>
              <p className="mt-1 text-[17px] font-medium leading-snug text-ink">
                {isManual ? "Edição direta do texto no editor" : <>&ldquo;{change.request}&rdquo;</>}
              </p>
              {analysis && analysis.answers.length > 0 && (
                <p className="mt-1 text-[12.5px] text-ink-faint">
                  Esclarecimentos:{" "}
                  {analysis.answers
                    .map((a) => (a === "escopo:*" ? "todo o prompt" : a.replace(/^escopo:/, "somente em ").replace(/^detalhe:/, "")))
                    .join(" · ")}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <ImpactPill level={change.impactLevel} />
              <StatusPill status={change.status} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <GovernanceSteps status={change.status} />
            <span className="text-[11.5px] text-ink-faint">
              {formatDateTime(change.createdAt)} · {change.createdBy}
              {change.fromVersion && ` · sobre a v${change.fromVersion.version}`}
            </span>
          </div>
        </CardBody>
      </Card>

      {stale && change.fromVersion && current && change.kind === "PEDIDO" && (
        <StaleBanner changeId={change.id} slug={prompt.slug} fromVersion={change.fromVersion.version} currentVersion={current.version} />
      )}
      {stale && change.fromVersion && current && isDiagnosis && (
        <p className="rounded border border-warn-border bg-warn-bg px-4 py-3 text-sm text-warn">
          O prompt mudou desde este diagnóstico (feito sobre a v{change.fromVersion.version}, versão atual v{current.version}). Para
          aplicar sobre o prompt atual, refaça o diagnóstico na aba{" "}
          <Link href={`/p/${prompt.slug}/alterar`} className="underline">
            Alterar prompt
          </Link>
          .
        </p>
      )}

      {isDiagnosis && analysis?.conversationInput && (
        <Card>
          <CardBody className="space-y-3">
            {analysis.conversationInput.transcript && (
              <div>
                <Eyebrow className="mb-1">Conversa analisada</Eyebrow>
                <pre className="whitespace-pre-wrap rounded border border-line bg-sunken px-3 py-2 font-mono text-[12.5px] text-ink-soft">
                  {analysis.conversationInput.transcript}
                </pre>
              </div>
            )}
            {analysis.conversationInput.hadImage && (
              <p className="text-[12.5px] text-ink-faint">A conversa foi enviada como print de tela (imagem).</p>
            )}
            <div>
              <Eyebrow className="mb-1">Comportamento esperado</Eyebrow>
              <p className="text-[13px] text-ink">{analysis.conversationInput.expectedBehavior}</p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Ambiguidade: a pergunta vem antes de tudo, porque sem a resposta nada pode ser proposto */}
      {analysis?.clarification && ["AGUARDANDO_ESCLARECIMENTO", "SEM_ALTERACAO"].includes(change.status) && !stale && (
        <ClarificationPanel key={analysis.answers.length} changeId={change.id} clarification={analysis.clarification} />
      )}

      {/* PASSO 3–4: análise (nada alterado ainda) */}
      {analysis?.audit && (
        <>
          <Card>
            <CardBody className="space-y-1.5">
              <Eyebrow>Entendimento da solicitação</Eyebrow>
              <p className="text-[15px] leading-relaxed text-ink">{analysis.understanding}</p>
              <p className="text-sm text-ink-soft">{analysis.suggestion}</p>
            </CardBody>
          </Card>
          <AuditReport audit={analysis.audit} slug={prompt.slug} />
        </>
      )}

      {analysis && !analysis.audit && (
        <AnalysisReport analysis={analysis} showSuggestion={change.status !== "VERSIONADA"} />
      )}

      {isManual && (
        <Card>
          <CardBody>
            <Eyebrow className="mb-1.5">Seções alteradas</Eyebrow>
            <div className="flex flex-wrap gap-1.5">
              {readStringList(change.affectedSections).map((s) => (
                <Pill key={s} tone="accent">
                  {s}
                </Pill>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {change.status === "SEM_ALTERACAO" && !analysis?.clarification && (
        <p className="rounded border border-line bg-sunken px-4 py-3 text-sm text-ink-soft">
          Nenhuma alteração a propor para este pedido. Reformule o pedido na aba{" "}
          <Link href={`/p/${prompt.slug}/alterar`} className="text-accent underline">
            Alterar prompt
          </Link>
          .
        </p>
      )}

      {/* PASSO 5: aprovação */}
      {analysis && change.status === "AGUARDANDO_APROVACAO" && !stale && (
        <OperationsEditor key={change.analysis.length} changeId={change.id} operations={analysis.operations} />
      )}

      {/* PASSO 6–8: novo prompt, diff e validação */}
      {analysis && ["APLICADA", "VERSIONADA"].includes(change.status) && (
        <OperationsEditor changeId={change.id} operations={analysis.operations} readOnly />
      )}

      {change.fromVersion && change.proposedContent !== null && ["APLICADA", "VERSIONADA"].includes(change.status) && (
        <RuleDiffView
          previous={change.fromVersion.content}
          next={change.proposedContent}
          title={
            change.toVersion
              ? `Comparação: v${change.fromVersion.version} → v${change.toVersion.version}`
              : `Comparação: v${change.fromVersion.version} → novo prompt (ainda não salvo)`
          }
        />
      )}

      {validation && ["APLICADA", "VERSIONADA"].includes(change.status) && <ValidationPanel validation={validation} />}

      {/* PASSO 9: salvar como nova versão */}
      {change.status === "APLICADA" && !stale && (
        <SaveVersionPanel
          changeId={change.id}
          nextVersion={(latest?.version ?? 0) + 1}
          defaultDescription={isManual ? "" : change.request.replace(/\.$/, "").slice(0, 120)}
          canReopen={!isManual}
          hasErrors={validation?.summary === "erro"}
        />
      )}

      {change.status === "VERSIONADA" && change.toVersion && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-added-border bg-added-bg px-4 py-3 text-sm text-added">
          <span>
            Alteração aplicada. Esta é a nova versão do prompt: <strong>v{change.toVersion.version}</strong> — &ldquo;{change.toVersion.changeDescription}&rdquo;.
          </span>
          <span className="flex gap-3">
            <Link href={`/p/${prompt.slug}/versoes/${change.toVersion.id}`} className="font-medium underline">
              Ver versão
            </Link>
            <Link href={`/p/${prompt.slug}`} className="font-medium underline">
              Abrir prompt
            </Link>
          </span>
        </div>
      )}
    </div>
  );
}
