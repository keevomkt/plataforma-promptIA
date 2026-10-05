"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Form";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui/Surfaces";
import { WordDiff } from "@/components/change/WordDiff";
import { applyChange, cancelChange } from "@/lib/actions/changes";
import type { Operation, RuleCheck, RuleDecision } from "@/lib/engine/types";

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
  checks = [],
  decisions = [],
}: {
  changeId: string;
  operations: Operation[];
  readOnly?: boolean;
  /** Avaliação de conflito (rulecheck.ts): as conflitantes exigem decisão antes de aplicar. */
  checks?: RuleCheck[];
  decisions?: RuleDecision[];
}) {
  const router = useRouter();
  // Na edição, operações que vieram de decisões anteriores aparecem como decisão, não como operação solta
  const [ops, setOps] = useState(readOnly ? operations : operations.filter((o) => !o.id.startsWith("decisao-")));
  const conflicts = checks.filter((c) => c.kind === "conflitante");
  const [choices, setChoices] = useState<Record<number, Choice>>(() =>
    Object.fromEntries(
      conflicts.map((c) => {
        const d = decisions.find((x) => x.line === c.line);
        return [c.line, d ? { choice: d.choice, text: d.text } : { choice: null, text: "" }];
      })
    )
  );
  const undecided = conflicts.filter((c) => !choices[c.line]?.choice).length;
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
        ops.map((o) => ({ id: o.id, enabled: o.enabled, newText: o.newText })),
        conflicts.flatMap((c) => {
          const ch = choices[c.line];
          return ch?.choice ? [{ line: c.line, choice: ch.choice, text: ch.text }] : [];
        })
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

        {!readOnly && conflicts.length > 0 && (
          <ConflictDecisions
            conflicts={conflicts}
            choices={choices}
            onChange={(line, patch) => setChoices((prev) => ({ ...prev, [line]: { ...prev[line], ...patch } }))}
            onCancel={cancel}
            disabled={isPending}
          />
        )}

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
              <Button variant="primary" onClick={apply} disabled={isPending || selected === 0 || undecided > 0}>
                {isPending ? "Aplicando…" : "Aplicar alteração"}
              </Button>
            </div>
            <p className="text-right text-[11.5px] text-ink-faint">
              {undecided > 0
                ? `Decida o que fazer com ${undecided === 1 ? "a regra conflitante" : `as ${undecided} regras conflitantes`} para poder aplicar.`
                : "Aplicar monta o prompt completo e o valida. Nada é salvo até você confirmar a nova versão."}
            </p>
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

type Choice = { choice: "alterar" | "manter" | null; text: string };

/** Mesma tela de decisão para qualquer origem do pedido: alterar a regra existente, manter as duas ou cancelar. */
function ConflictDecisions({
  conflicts,
  choices,
  onChange,
  onCancel,
  disabled,
}: {
  conflicts: RuleCheck[];
  choices: Record<number, Choice>;
  onChange: (line: number, patch: Partial<Choice>) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  return (
    <div className="space-y-3 rounded border border-warn-border bg-warn-bg/40 px-3 py-3">
      <div>
        <p className="text-[13px] font-semibold text-warn">
          Decisão necessária: {conflicts.length === 1 ? "1 regra atual conflita" : `${conflicts.length} regras atuais conflitam`} com a alteração
        </p>
        <p className="text-[12px] text-ink-soft">Se as duas ficarem como estão, a IA recebe instruções opostas e pode seguir qualquer uma.</p>
      </div>
      {conflicts.map((c) => {
        const ch = choices[c.line] ?? { choice: null, text: "" };
        const name = `decisao-${c.line}`;
        return (
          <div key={c.line} className="space-y-2 rounded border border-line bg-surface px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill tone="warn">CONFLITANTE</Pill>
              <span className="text-[12px] font-medium text-ink-soft">{c.section}</span>
              <span className="font-mono text-[11px] text-ink-faint">linha {c.line + 1}</span>
            </div>
            <p className="rounded border border-line bg-sunken px-2 py-1 font-mono text-[12.5px] text-ink">{c.text}</p>
            <p className="text-[12.5px] text-warn">{c.explanation}</p>
            <div className="space-y-1.5 text-[13px]">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name={name}
                  checked={ch.choice === "alterar"}
                  onChange={() => onChange(c.line, { choice: "alterar", text: ch.choice === "alterar" ? ch.text : c.text })}
                  className="mt-1 accent-accent"
                  disabled={disabled}
                />
                <span>
                  <span className="font-medium text-ink">Alterar a regra existente</span>
                  <span className="text-ink-faint"> — reescreva para ficar coerente com a alteração (vazio remove a regra)</span>
                </span>
              </label>
              {ch.choice === "alterar" && (
                <div className="pl-6">
                  <Textarea
                    value={ch.text}
                    onChange={(e) => onChange(c.line, { text: e.target.value })}
                    rows={3}
                    className="font-mono text-[12.5px]"
                    disabled={disabled}
                  />
                </div>
              )}
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name={name}
                  checked={ch.choice === "manter"}
                  onChange={() => onChange(c.line, { choice: "manter", text: ch.choice === "manter" ? ch.text : "" })}
                  className="mt-1 accent-accent"
                  disabled={disabled}
                />
                <span>
                  <span className="font-medium text-ink">Manter as duas, cada uma numa situação</span>
                  <span className="text-ink-faint"> — explique quando vale cada uma (fica registrado no histórico)</span>
                </span>
              </label>
              {ch.choice === "manter" && (
                <div className="space-y-1 pl-6">
                  <Textarea
                    value={ch.text}
                    onChange={(e) => onChange(c.line, { text: e.target.value })}
                    rows={2}
                    placeholder="Ex.: a regra atual vale quando…; a nova vale quando…"
                    className="text-[12.5px]"
                    disabled={disabled}
                  />
                  <p className="text-[11px] text-ink-faint">Se a condição precisa estar escrita no prompt, use “Editar” e inclua a condição no texto da alteração.</p>
                </div>
              )}
              <label className="flex items-start gap-2">
                <input type="radio" name={name} checked={false} onChange={() => setConfirmCancel(true)} className="mt-1 accent-accent" disabled={disabled} />
                <span className="font-medium text-ink">Cancelar a alteração</span>
              </label>
            </div>
          </div>
        );
      })}
      {confirmCancel && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-removed-border bg-removed-bg px-3 py-2 text-[12.5px] text-removed">
          <span>Cancelar a alteração inteira? Nada será aplicado.</span>
          <Button size="sm" variant="danger" onClick={onCancel} disabled={disabled}>
            Sim, cancelar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(false)} disabled={disabled}>
            Voltar
          </Button>
        </div>
      )}
    </div>
  );
}
