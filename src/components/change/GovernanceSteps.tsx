import clsx from "clsx";

const STEPS = ["Solicitada", "Analisada", "Aprovada", "Aplicada", "Validada", "Versionada"];

/** Etapas da seção 21: SOLICITADA → ANALISADA → … → VERSIONADA. */
export function GovernanceSteps({ status }: { status: string }) {
  const reached: Record<string, number> = {
    AGUARDANDO_ESCLARECIMENTO: 1,
    SEM_ALTERACAO: 1,
    AGUARDANDO_APROVACAO: 1,
    APLICADA: 4,
    VERSIONADA: 5,
    REVISAO_CONCLUIDA: 1,
    RESPONDIDA: 1,
    CANCELADA: -1,
  };
  const current = reached[status] ?? 0;

  return (
    <ol className="flex flex-wrap items-center gap-y-1 text-[11.5px]">
      {STEPS.map((s, i) => {
        const done = current >= 0 && i <= current;
        return (
          <li key={s} className="flex items-center">
            <span
              className={clsx(
                "rounded-sm px-1.5 py-0.5 font-medium",
                status === "CANCELADA" ? "text-ink-faint line-through" : done ? "bg-accent-soft text-accent-strong" : "text-ink-faint"
              )}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && <span className="px-1 text-ink-faint">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
