/**
 * Identidade visual: logo da Keevo e das unidades de negócio.
 * Os arquivos ficam em public/brand/.
 */

export type BusinessUnitId = "HCM" | "ERP" | "EC" | "3UN";

export type BusinessUnit = {
  id: BusinessUnitId;
  /** Marca/produto que representa a unidade. */
  brand: string;
  logo: string;
  /** Proporção largura/altura da imagem original. */
  aspect: number;
  /**
   * Fundo do quadro onde a logo aparece: "none" (logo com fundo transparente,
   * sem quadro), "light", "dark" (logo clara) ou "bleed" (a logo já vem com
   * fundo próprio, como a da Alpha, ou é só um símbolo quadrado, como o da Keevo).
   */
  tile: "none" | "light" | "dark" | "bleed";
  /**
   * Em tamanhos pequenos, mostra só o símbolo à esquerda da logo (largura
   * do recorte = altura × markRatio). Usado quando o nome ficaria ilegível.
   */
  markRatio?: number;
  /** Agente das três unidades juntas: usa a base de conhecimento inteira. */
  allUnits?: boolean;
};

export const KEEVO_LOGO = "/brand/keevo.png";

export const BUSINESS_UNITS: Record<BusinessUnitId, BusinessUnit> = {
  HCM: { id: "HCM", brand: "eKeep", logo: "/brand/ekeep-logo.png", aspect: 978 / 360, tile: "none" },
  ERP: { id: "ERP", brand: "Alpha", logo: "/brand/alpha.png", aspect: 1, tile: "bleed" },
  EC: { id: "EC", brand: "Holos", logo: "/brand/holos.png", aspect: 527 / 173, tile: "light", markRatio: 150 / 173 },
  "3UN": { id: "3UN", brand: "Keevo", logo: KEEVO_LOGO, aspect: 1, tile: "bleed", allUnits: true },
};

export const UNIT_IDS = Object.keys(BUSINESS_UNITS) as BusinessUnitId[];

/** Aceita "HCM", "hcm", "eKeep", "Holos", "3UN", "Keevo"... e devolve a unidade correspondente. */
export function resolveUnit(value: string | null | undefined): BusinessUnit | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  return Object.values(BUSINESS_UNITS).find((u) => u.id.toLowerCase() === v || u.brand.toLowerCase() === v);
}
