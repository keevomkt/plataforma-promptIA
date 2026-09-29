import { cookies } from "next/headers";

export const USER_COOKIE = "keevo_responsavel";
export const ANONYMOUS = "não identificado";

/**
 * Nome do responsável pelas alterações. Sem login nesta versão: cada
 * pessoa informa o próprio nome na barra lateral e ele fica gravado em um
 * cookie do navegador, sendo registrado em toda versão e alteração.
 */
export function getCurrentUser(): string {
  const value = cookies().get(USER_COOKIE)?.value;
  return value ? decodeURIComponent(value) : ANONYMOUS;
}
