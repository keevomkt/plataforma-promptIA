"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { clearDeadChanges } from "@/lib/actions/changes";

/** Apaga de uma vez os pedidos cancelados/sem alteração — nunca toca em pedidos versionados. */
export function ClearDeadChangesButton({ promptId, count }: { promptId: string; count: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      await clearDeadChanges(promptId);
      setConfirming(false);
      router.refresh();
    });
  }

  if (!count) return null;

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5 text-xs">
        <span className="text-ink-faint">Excluir {count} pedido(s) cancelado(s), sem alteração, revisões ou perguntas respondidas?</span>
        <Button size="sm" variant="danger" onClick={run} disabled={isPending}>
          {isPending ? "Excluindo…" : "Confirmar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={isPending}>
          Cancelar
        </Button>
      </span>
    );
  }

  return (
    <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
      Limpar {count} sem versão
    </Button>
  );
}
