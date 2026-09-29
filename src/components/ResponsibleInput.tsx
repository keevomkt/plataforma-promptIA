"use client";

import { useState, useTransition } from "react";
import { setResponsible } from "@/lib/actions/prompts";

/** Nome registrado como responsável em cada alteração e versão. */
export function ResponsibleInput({ initial }: { initial: string }) {
  const [name, setName] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function save() {
    if (name.trim() === saved) return;
    startTransition(async () => {
      await setResponsible(name);
      setSaved(name.trim());
    });
  }

  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Responsável</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        placeholder="Seu nome"
        className="mt-1 w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />
      <span className="mt-1 block text-[11px] text-ink-faint">
        {isPending ? "Salvando…" : saved ? "Registrado em cada alteração." : "Informe seu nome para o histórico."}
      </span>
    </label>
  );
}
