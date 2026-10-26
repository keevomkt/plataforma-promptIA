/**
 * Papéis de acesso (User.role):
 * - ADMIN: cadastra e altera agentes, base de conhecimento e usuários.
 * - CURADORIA: curadoria de IA (SDRs). Adiciona e altera documentos da base de
 *   conhecimento; nos agentes, só lê a aba Prompt.
 * - USUARIO: só lê a aba Prompt de cada agente e a base de conhecimento.
 */
export type Role = "ADMIN" | "CURADORIA" | "USUARIO";

export const ROLES: Role[] = ["ADMIN", "CURADORIA", "USUARIO"];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  CURADORIA: "Curadoria de IA",
  USUARIO: "Usuário",
};

/** Valor do banco → papel conhecido (qualquer outro valor vale como Usuário, o mais restrito). */
export function toRole(value: string): Role {
  return (ROLES as string[]).includes(value) ? (value as Role) : "USUARIO";
}

/** Pode adicionar, editar, substituir e excluir documentos da base de conhecimento. */
export function canEditKnowledge(role: Role): boolean {
  return role === "ADMIN" || role === "CURADORIA";
}
