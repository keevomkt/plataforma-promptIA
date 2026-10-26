"use client";

import clsx from "clsx";
import { BUSINESS_UNITS, UNIT_IDS, type BusinessUnitId } from "@/lib/brand";
import { UnitLogo } from "@/components/Brand";

/** Botões com a logo de cada unidade de negócio. Clicar na escolhida desmarca. */
export function UnitChoice({
  value,
  onChange,
  compact,
}: {
  value: BusinessUnitId | null;
  onChange: (unit: BusinessUnitId | null) => void;
  /** Espaço estreito (ex.: janela de edição): no máximo 2 colunas. */
  compact?: boolean;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Unidade de negócio</span>
      <div className={clsx("grid grid-cols-1 gap-2 sm:grid-cols-2", !compact && "xl:grid-cols-4")}>
        {UNIT_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(value === id ? null : id)}
            className={clsx(
              "flex items-center gap-3 rounded border px-3 py-2.5 text-left transition-colors",
              value === id ? "border-accent bg-accent-soft ring-1 ring-accent" : "border-line bg-surface hover:border-line-strong"
            )}
          >
            <UnitLogo unit={id} height={28} />
            <span className="leading-tight">
              <span className="block text-[13px] font-semibold text-ink">{id}</span>
              <span className="block text-[11.5px] text-ink-faint">{BUSINESS_UNITS[id].allUnits ? "Keevo · 3 unidades" : BUSINESS_UNITS[id].brand}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
