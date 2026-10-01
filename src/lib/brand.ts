/**
 * Identidade visual: logo da Keevo e das unidades de negócio.
 * Os arquivos ficam em public/brand/.
 */

export type BusinessUnitId = "HCM" | "ERP" | "EC";

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
   * fundo próprio, como a da Alpha).
   */
  tile: "none" | "light" | "dark" | "bleed";
  /**
   * Em tamanhos pequenos, mostra só o símbolo à esquerda da logo (largura
   * do recorte = altura × markRatio). Usado quando o nome ficaria ilegível.
   */
  markRatio?: number;
};

export const KEEVO_LOGO = "/brand/keevo.png";

export const BUSINESS_UNITS: Record<BusinessUnitId, BusinessUnit> = {
  HCM: { id: "HCM", brand: "eKeep", logo: "/brand/ekeep-logo.png", aspect: 978 / 360, tile: "none" },
  ERP: { id: "ERP", brand: "Alpha", logo: "/brand/alpha.png", aspect: 1, tile: "bleed" },
  EC: { id: "EC", brand: "Holos", logo: "/brand/holos.png", aspect: 527 / 173, tile: "light", markRatio: 150 / 173 },
};

export const UNIT_IDS = Object.keys(BUSINESS_UNITS) as BusinessUnitId[];

/** Aceita "HCM", "hcm", "eKeep", "Holos"... e devolve a unidade correspondente. */
export function resolveUnit(value: string | null | undefined): BusinessUnit | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  return Object.values(BUSINESS_UNITS).find((u) => u.id.toLowerCase() === v || u.brand.toLowerCase() === v);
}
