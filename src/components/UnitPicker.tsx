"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BUSINESS_UNITS, UNIT_IDS, type BusinessUnitId } from "@/lib/brand";
import { setPromptUnit } from "@/lib/actions/prompts";

/** Mostra a unidade do prompt ("HCM · eKeep") e permite trocar. */
export function UnitPicker({ promptId, value }: { promptId: string; value: BusinessUnitId | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  function change(next: string) {
    startTransition(async () => {
      await setPromptUnit(promptId, next || null);
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <select
        autoFocus
        defaultValue={value ?? ""}
        disabled={isPending}
        onChange={(e) => change(e.target.value)}
        onBlur={() => setEditing(false)}
        className="rounded border border-line bg-surface px-1.5 py-0.5 text-xs text-ink focus:border-accent focus:outline-none"
      >
        <option value="">Sem unidade</option>
        {UNIT_IDS.map((id) => (
          <option key={id} value={id}>
            {id} · {BUSINESS_UNITS[id].brand}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button type="button" onClick={() => setEditing(true)} className="group inline-flex items-center gap-1 hover:text-accent" title="Trocar unidade">
      {value ? (
        <>
          <span className="font-semibold text-ink-soft group-hover:text-accent">{value}</span>
          <span>· {BUSINESS_UNITS[value].brand}</span>
        </>
      ) : (
        <span className="text-accent">Definir unidade de negócio</span>
      )}
    </button>
  );
}
