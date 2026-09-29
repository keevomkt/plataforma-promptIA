"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Card, CardBody } from "@/components/ui/Surfaces";
import { deleteKnowledgeDocument, updateKnowledgeMeta } from "@/lib/actions/knowledge";
import { KNOWLEDGE_CATEGORIES } from "@/lib/engine/types";

type Meta = { title: string; businessUnit: string; category: string; description: string };

export function KnowledgeMetaForm({ id, units, initial }: { id: string; units: string[]; initial: Meta }) {
  const router = useRouter();
  const [meta, setMeta] = useState(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const dirty = JSON.stringify(meta) !== JSON.stringify(initial);
  const set = (patch: Partial<Meta>) => setMeta((m) => ({ ...m, ...patch }));

  function save() {
    startTransition(async () => {
      const r = await updateKnowledgeMeta(id, meta);
      setMessage(r.ok ? { ok: true, text: "Dados salvos." } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      await deleteKnowledgeDocument(id);
      router.push("/conhecimento");
    });
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <Field label="Título">
          <Input value={meta.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Unidade de negócio">
            <Input value={meta.businessUnit} onChange={(e) => set({ businessUnit: e.target.value })} list="kb-units-edit" />
            <datalist id="kb-units-edit">
              {units.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </Field>
          <Field label="Categoria">
            <select
              value={meta.category}
              onChange={(e) => set({ category: e.target.value })}
              className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {Object.entries(KNOWLEDGE_CATEGORIES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Descrição">
          <Input value={meta.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>

        {message && <p className={message.ok ? "text-xs text-added" : "text-xs text-removed"}>{message.text}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {confirmDelete ? (
            <span className="flex items-center gap-2 text-[12.5px] text-removed">
              Excluir o documento e todas as revisões?
              <Button size="sm" variant="danger" onClick={remove} disabled={isPending}>
                Excluir
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={isPending}>
                Cancelar
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" className="text-removed" onClick={() => setConfirmDelete(true)}>
              Excluir documento
            </Button>
          )}
          <Button variant="primary" onClick={save} disabled={!dirty || isPending}>
            {isPending ? "Salvando…" : "Salvar dados"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
