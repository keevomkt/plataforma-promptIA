import Image from "next/image";
import clsx from "clsx";
import { KEEVO_LOGO, resolveUnit } from "@/lib/brand";

/** Logo da Keevo com o nome do produto ao lado. */
export function KeevoMark({ size = 28, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image src={KEEVO_LOGO} alt="Keevo" width={size} height={size} priority />
      {withText && (
        <span className="leading-tight">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Keevo</span>
          <span className="block text-[15px] font-semibold text-ink">Prompt Studio</span>
        </span>
      )}
    </span>
  );
}

/**
 * Logo da unidade de negócio (eKeep, Alpha, Holos) numa altura fixa,
 * respeitando a proporção original e o fundo que cada marca precisa.
 * Unidades desconhecidas viram um selo de texto.
 */
export function UnitLogo({
  unit,
  height = 22,
  className,
  priority,
}: {
  unit: string | null | undefined;
  height?: number;
  className?: string;
  /** Carrega a imagem de imediato (logos no topo da página). */
  priority?: boolean;
}) {
  const info = resolveUnit(unit);
  if (!info) {
    if (!unit) return null;
    return (
      <span
        className={clsx("inline-flex items-center rounded-sm border border-line bg-sunken px-1.5 text-[10px] font-semibold uppercase text-ink-faint", className)}
        style={{ height }}
      >
        {unit}
      </span>
    );
  }

  if (info.tile === "bleed") {
    return (
      <Image
        src={info.logo}
        alt={`${info.brand} (${info.id})`}
        title={`${info.brand} · ${info.id}`}
        width={height}
        height={height}
        priority={priority}
        className={clsx("shrink-0 rounded-[5px]", className)}
      />
    );
  }

  // Logo transparente não tem quadro: ocupa a altura toda, sem margem
  const bare = info.tile === "none";
  const pad = bare ? 0 : Math.max(3, Math.round(height * 0.18));
  const inner = height - pad * 2;
  const logoWidth = Math.round(inner * info.aspect);
  // Pequeno demais para ler o nome: recorta só o símbolo
  const cropWidth = info.markRatio && height <= 26 ? Math.round(inner * info.markRatio) : undefined;
  return (
    <span
      title={`${info.brand} · ${info.id}`}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center",
        !bare && "rounded-[5px]",
        info.tile === "dark" && "bg-[#0E1630]",
        info.tile === "light" && "border border-line bg-white",
        className
      )}
      style={{ height, paddingInline: bare ? 0 : cropWidth ? pad : pad + 2 }}
    >
      <span className="block overflow-hidden" style={{ width: cropWidth ?? logoWidth, height: inner }}>
        <Image
          src={info.logo}
          alt={`${info.brand} (${info.id})`}
          width={logoWidth}
          height={inner}
          priority={priority}
          className="max-w-none"
          style={{ width: logoWidth, height: inner }}
        />
      </span>
    </span>
  );
}
