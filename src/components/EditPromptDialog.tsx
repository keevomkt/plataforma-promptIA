"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { UnitChoice } from "@/components/UnitChoice";
import { updatePromptInfo } from "@/lib/actions/prompts";
import { resolveUnit, type BusinessUnitId } from "@/lib/brand";

type PromptInfo = { id: string; name: string; description: string | null; unit: string | null };

/** Janela para editar o cadastro do agente: nome, descrição e unidade (logo). */
export function EditPromptDialog({ prompt, onClose }: { prompt: PromptInfo; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(prompt.name);
  const [description, setDescription] = useState(prompt.description ?? "");
  const [unit, setUnit] = useState<BusinessUnitId | null>(resolveUnit(prompt.unit)?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updatePromptInfo({ promptId: prompt.id, name, description, businessUnit: unit });
      if (result.ok) {
        router.refresh();
        onClose();
      } else setError(result.error);
    });
  }

  // Portal no <body>: a barra superior tem backdrop-blur, que prenderia o "fixed" dentro dela
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="editar-agente"
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-md border border-line bg-surface shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-line px-5 py-3">
          <h2 id="editar-agente" className="text-[15px] font-semibold text-ink">
            Editar agente
          </h2>
          <p className="text-[12px] text-ink-faint">Muda só o cadastro. O texto do prompt e as versões continuam iguais.</p>
        </div>
        <form
          className="space-y-4 overflow-y-auto px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <UnitChoice value={unit} onChange={setUnit} compact />
          <Field label="Nome">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Agente Comercial Keevo" />
          </Field>
          <Field label="Descrição (opcional)">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Bot comercial do WhatsApp" />
          </Field>
          {error && <p className="text-sm text-removed">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={isPending || !name.trim()}>
              {isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
