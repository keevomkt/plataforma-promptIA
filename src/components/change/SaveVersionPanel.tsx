"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { Card, CardBody } from "@/components/ui/Surfaces";
import { cancelChange, reopenChange, saveAsVersion } from "@/lib/actions/changes";

/** PASSO 9: o usuário revisou diff e validação e salva a nova versão. */
export function SaveVersionPanel({
  changeId,
  nextVersion,
  defaultDescription,
  canReopen,
  hasErrors,
}: {
  changeId: string;
  nextVersion: number;
  defaultDescription: string;
  canReopen: boolean;
  hasErrors: boolean;
}) {
  const router = useRouter();
  const [description, setDescription] = useState(defaultDescription);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) router.refresh();
      else setError(result.error ?? "Erro.");
    });
  }

  return (
    <Card className="border-accent/40">
      <CardBody className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Salvar como nova versão</div>
        <label className="block">
          <span className="mb-1 block text-[13px] text-ink-soft">Descrição da alteração (aparece no histórico da v{nextVersion})</span>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Remoção da pergunta de CNPJs" />
        </label>
        {hasErrors && (
          <p className="rounded border border-removed-border bg-removed-bg px-3 py-2 text-xs text-removed">
            A validação encontrou problemas. Revise antes de salvar — ou volte e edite a alteração.
          </p>
        )}
        {error && <p className="text-xs text-removed">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={isPending} onClick={() => run(() => cancelChange(changeId))}>
            Descartar
          </Button>
          {canReopen && (
            <Button variant="secondary" disabled={isPending} onClick={() => run(() => reopenChange(changeId))}>
              Voltar e editar
            </Button>
          )}
          <Button variant="primary" disabled={isPending || !description.trim()} onClick={() => run(() => saveAsVersion(changeId, description))}>
            {isPending ? "Salvando…" : `Salvar como v${nextVersion}`}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
