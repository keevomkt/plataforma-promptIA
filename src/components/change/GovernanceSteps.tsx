import clsx from "clsx";

/**
 * Etapas de uma alteração, até o passo manual que leva a mudança para a
 * KeevoIA (onde o prompt roda de verdade), e o que fazer em seguida.
 */
export function GovernanceSteps({ status, kind, copied }: { status: string; kind: string; copied: boolean }) {
  const steps = [kind === "CLAUDE" ? "Interpretada" : "Analisada", "Revisada", "Aplicada e validada", "Versão salva", "Copiada para a KeevoIA"];
  const reached: Record<string, number> = {
    AGUARDANDO_ESCLARECIMENTO: 0,
    SEM_ALTERACAO: 0,
    AGUARDANDO_APROVACAO: 0,
    APLICADA: 2,
    VERSIONADA: copied ? 4 : 3,
    CANCELADA: -1,
  };
  const current = reached[status] ?? 0;

  return (
    <ol className="flex flex-wrap items-center gap-y-1 text-[11.5px]">
      {steps.map((s, i) => {
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
            {i < steps.length - 1 && <span className="px-1 text-ink-faint">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Uma frase dizendo o que falta fazer, para ninguém ficar sem saber em que ponto está. */
export function NextStep({ status, copied }: { status: string; copied: boolean }) {
  const text: Record<string, string> = {
    AGUARDANDO_ESCLARECIMENTO: "Próximo passo: responda à pergunta abaixo para a análise continuar.",
    AGUARDANDO_APROVACAO: "Próximo passo: confira o antes e depois de cada mudança, decida os conflitos (se houver) e clique em “Aplicar alteração”. Nada foi alterado ainda.",
    APLICADA: "Próximo passo: confira a comparação e a validação e salve a nova versão. O prompt vigente ainda não mudou.",
    VERSIONADA: copied
      ? "Concluída: a versão foi salva e copiada para a KeevoIA."
      : "Próximo passo: copie a nova versão para a KeevoIA (quadro no fim da página). Só assim a mudança passa a valer na IA em produção.",
    CANCELADA: "Cancelada: nada foi aplicado ao prompt.",
  };
  if (!text[status]) return null;
  const pending = status === "VERSIONADA" && !copied;
  return <p className={clsx("text-[12.5px]", pending ? "font-medium text-warn" : "text-ink-soft")}>{text[status]}</p>;
}
