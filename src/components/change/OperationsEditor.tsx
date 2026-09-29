"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Form";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui/Surfaces";
import { WordDiff } from "@/components/change/WordDiff";
import { applyChange, cancelChange } from "@/lib/actions/changes";
import type { Operation } from "@/lib/engine/types";

const ROLE_LABELS: Record<Operation["role"], string> = {
  principal: "Alteração principal",
  relacionada: "Ajuste relacionado",
  revisao: "Revisão sugerida",
};

/**
 * Alteração proposta (seções 4 e 5): o usuário vê exatamente o que será
 * removido, adicionado ou alterado, pode desmarcar operações, editar o
 * texto novo e só então aplicar.
 */
export function OperationsEditor({
  changeId,
  operations,
  readOnly,
}: {
  changeId: string;
  operations: Operation[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [ops, setOps] = useState(operations);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const update = (id: string, patch: Partial<Operation>) => setOps((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const selected = ops.filter((o) => o.enabled).length;
  const visible = readOnly ? ops.filter((o) => o.enabled) : ops;

  function apply() {
    setError(null);
    startTransition(async () => {
      const result = await applyChange(
        changeId,
        ops.map((o) => ({ id: o.id, enabled: o.enabled, newText: o.newText }))
      );
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  function cancel() {
    startTransition(async () => {
      await cancelChange(changeId);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{readOnly ? "Alteração aplicada" : "Alteração proposta"}</span>
        {!readOnly && (
          <span className="text-xs text-ink-faint">
            {selected} de {ops.length} operação(ões) selecionada(s)
          </span>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        {visible.map((op) => (
          <OperationItem key={op.id} op={op} editing={editing && !readOnly} readOnly={readOnly} onChange={(patch) => update(op.id, patch)} />
        ))}
        {!visible.length && <p className="text-sm text-ink-faint">Nenhuma operação.</p>}

        {!readOnly && (
          <>
            {error && <p className="rounded border border-removed-border bg-removed-bg px-3 py-2 text-xs text-removed">{error}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
              <Button variant="ghost" onClick={cancel} disabled={isPending}>
                Cancelar
              </Button>
              <Button variant="secondary" onClick={() => setEditing((v) => !v)} disabled={isPending}>
                {editing ? "Concluir edição" : "Editar"}
              </Button>
              <Button variant="primary" onClick={apply} disabled={isPending || selected === 0}>
                {isPending ? "Aplicando…" : "Aplicar alteração"}
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function OperationItem({
  op,
  editing,
  readOnly,
  onChange,
}: {
  op: Operation;
  editing: boolean;
  readOnly?: boolean;
  onChange: (patch: Partial<Operation>) => void;
}) {
  const isRemove = op.type === "remover_linha" || (op.type === "substituir_linha" && !op.newText.trim());
  const isInsert = op.type === "inserir_apos";
  const unchanged = op.type === "substituir_linha" && op.newText === op.oldText;
  const kind = isRemove ? "REMOVER" : isInsert ? "ADICIONAR" : unchanged ? "REVISAR" : "ALTERAR";
  const tone = isRemove ? "removed" : isInsert ? "added" : unchanged ? "neutral" : "warn";

  return (
    <div className={clsx("rounded border px-3 py-2.5", op.enabled ? "border-line bg-surface" : "border-dashed border-line bg-sunken/60")}>
      <div className="flex items-start gap-2.5">
        {!readOnly && (
          <input
            type="checkbox"
            checked={op.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            className="mt-1 h-4 w-4 shrink-0 accent-accent"
            aria-label="Incluir esta operação"
          />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={tone}>{kind}</Pill>
            <span className="text-[12px] font-medium text-ink-soft">{op.section}</span>
            <span className="text-[11px] text-ink-faint">· {ROLE_LABELS[op.role]}</span>
            {op.line >= 0 && <span className="font-mono text-[11px] text-ink-faint">linha {op.line + 1}</span>}
          </div>
          <p className="text-[12.5px] text-ink-faint">{op.reason}</p>

          {editing && op.type !== "remover_linha" ? (
            <div className="space-y-1">
              {!isInsert && (
                <p className="rounded border border-line bg-sunken px-2 py-1 font-mono text-[12px] text-ink-faint">Atual: {op.oldText.trim()}</p>
              )}
              <Textarea
                value={op.newText.replace(/^\n/, "")}
                onChange={(e) => onChange({ newText: (op.newText.startsWith("\n") ? "\n" : "") + e.target.value, enabled: true })}
                rows={Math.min(8, Math.max(2, Math.ceil(op.newText.length / 90)))}
                className="font-mono text-[12.5px]"
              />
              {!isInsert && <p className="text-[11px] text-ink-faint">Deixe vazio para remover a linha.</p>}
            </div>
          ) : isRemove ? (
            <p className="rounded border border-removed-border bg-removed-bg px-2 py-1 font-mono text-[12.5px] text-removed line-through decoration-removed/40">
              {op.oldText.trim()}
            </p>
          ) : isInsert ? (
            <p className="whitespace-pre-wrap rounded border border-added-border bg-added-bg px-2 py-1 font-mono text-[12.5px] text-added">
              {op.newText.replace(/^\n/, "")}
            </p>
          ) : unchanged ? (
            <p className="rounded border border-line bg-sunken px-2 py-1 font-mono text-[12.5px] text-ink-soft">{op.oldText.trim()}</p>
          ) : (
            <div className="rounded border border-line bg-surface px-2 py-1 font-mono text-[12.5px] leading-relaxed">
              <WordDiff before={op.oldText.trim()} after={op.newText.trim()} />
            </div>
          )}
          {unchanged && !readOnly && !editing && (
            <p className="text-[11px] text-ink-faint">Clique em “Editar” para reescrever ou remover esta regra; sem edição, ela fica como está.</p>
          )}
        </div>
      </div>
    </div>
  );
}
