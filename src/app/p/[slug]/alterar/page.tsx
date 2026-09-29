import { getPromptBySlug, listChanges } from "@/lib/data";
import { ChangeRequestForm } from "@/components/ChangeRequestForm";
import { DiagnoseRequestForm, DiagnoseSetupNotice } from "@/components/DiagnoseRequestForm";
import { ChangeListItem } from "@/components/ChangeListItem";
import { ClearDeadChangesButton } from "@/components/ClearDeadChangesButton";
import { isAiConfigured } from "@/lib/ai/client";
import { Eyebrow } from "@/components/ui/Surfaces";

const OPEN = ["AGUARDANDO_ESCLARECIMENTO", "AGUARDANDO_APROVACAO", "APLICADA"];
const DELETABLE = ["CANCELADA", "SEM_ALTERACAO", "REVISAO_CONCLUIDA"];

export default async function ChangePage({ params, searchParams }: { params: { slug: string }; searchParams: { pedido?: string } }) {
  const prompt = await getPromptBySlug(params.slug);
  const changes = (await listChanges(prompt.id)).filter((c) => c.kind === "PEDIDO" || c.kind === "MANUAL" || c.kind === "DIAGNOSTICO");
  const open = changes.filter((c) => OPEN.includes(c.status));
  const recent = changes.filter((c) => !OPEN.includes(c.status)).slice(0, 8);
  const deadCount = changes.filter((c) => DELETABLE.includes(c.status)).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
      <ChangeRequestForm promptId={prompt.id} slug={prompt.slug} initial={searchParams.pedido ?? ""} />

      {isAiConfigured() ? <DiagnoseRequestForm slug={prompt.slug} /> : <DiagnoseSetupNotice />}

      {open.length > 0 && (
        <div>
          <Eyebrow className="mb-2">Em andamento</Eyebrow>
          <div className="space-y-2">
            {open.map((c) => (
              <ChangeListItem key={c.id} slug={prompt.slug} item={c} />
            ))}
          </div>
        </div>
      )}
      {recent.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <Eyebrow>Pedidos recentes</Eyebrow>
            <ClearDeadChangesButton promptId={prompt.id} count={deadCount} />
          </div>
          <div className="space-y-2">
            {recent.map((c) => (
              <ChangeListItem key={c.id} slug={prompt.slug} item={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
