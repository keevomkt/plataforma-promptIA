"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/data";
import { Card, CardBody, ImpactPill, StatusPill } from "@/components/ui/Surfaces";
import { deleteChange } from "@/lib/actions/changes";

const DELETABLE = ["CANCELADA", "SEM_ALTERACAO", "REVISAO_CONCLUIDA"];
const KIND_LABELS: Record<string, string> = { DIAGNOSTICO: "Diagnóstico de conversa" };

export function ChangeListItem({
  slug,
  item,
}: {
  slug: string;
  item: { id: string; kind: string; request: string; status: string; impactLevel: string | null; createdAt: Date; createdBy: string };
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canDelete = DELETABLE.includes(item.status);

  function remove() {
    startTransition(async () => {
      const result = await deleteChange(item.id);
      if (result.ok) router.refresh();
      else alert(result.error);
    });
  }

  return (
    <Card className="hover:border-line-strong">
      <CardBody className="flex items-center justify-between gap-3 py-2.5">
        <Link href={`/p/${slug}/alterar/${item.id}`} className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-ink">{item.request}</p>
          <p className="text-[11px] text-ink-faint">
            {formatDateTime(item.createdAt)} · {item.createdBy}
            {KIND_LABELS[item.kind] ? ` · ${KIND_LABELS[item.kind]}` : ""}
          </p>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5">
          <ImpactPill level={item.impactLevel} />
          <StatusPill status={item.status} />
          {canDelete &&
            (confirming ? (
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={remove}
                  className="rounded-sm border border-removed-border bg-removed-bg px-1.5 py-0.5 text-[11px] font-medium text-removed hover:bg-removed hover:text-white disabled:opacity-50"
                >
                  {isPending ? "…" : "Confirmar"}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setConfirming(false)}
                  className="rounded-sm px-1 text-[11px] text-ink-faint hover:text-ink-soft"
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                title="Excluir este pedido"
                className="rounded-sm px-1 py-0.5 text-ink-faint hover:bg-removed-bg hover:text-removed"
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  <path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5v8a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-8" strokeLinecap="round" />
                </svg>
              </button>
            ))}
        </div>
      </CardBody>
    </Card>
  );
}
