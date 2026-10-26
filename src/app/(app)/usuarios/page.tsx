import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { ROLE_LABELS, toRole } from "@/lib/auth/roles";
import { formatDateTime } from "@/lib/data";
import { UserRowActions, type AdminUserRow } from "@/components/auth/UserRowActions";
import { Card, CardBody, Eyebrow, Pill } from "@/components/ui/Surfaces";

export default async function UsersPage() {
  const me = await requireAdmin();
  const users = await prisma.user.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] });
  const rows: AdminUserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: toRole(u.role),
    status: u.status as AdminUserRow["status"],
    createdAt: formatDateTime(u.createdAt),
    lastLoginAt: u.lastLoginAt ? formatDateTime(u.lastLoginAt) : null,
    approvedBy: u.approvedBy,
    locked: !!u.lockedUntil && u.lockedUntil > new Date(),
    mustChangePassword: u.mustChangePassword,
    isMe: u.id === me.id,
  }));
  const pending = rows.filter((r) => r.status === "PENDENTE");
  const others = rows.filter((r) => r.status !== "PENDENTE");

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-6 py-6">
      <div>
        <h1 className="text-[20px] font-semibold text-ink">Usuários</h1>
        <p className="text-[13px] text-ink-faint">Aprove cadastros, defina a permissão de cada pessoa, bloqueie acessos e gere senhas provisórias.</p>
        <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-ink-faint">
          <li>
            <strong className="font-medium text-ink-soft">Administrador</strong>: cadastra e altera agentes, a base de conhecimento e os usuários.
          </li>
          <li>
            <strong className="font-medium text-ink-soft">Curadoria de IA</strong>: adiciona e altera documentos da base de conhecimento; nos agentes, só lê a aba Prompt.
          </li>
          <li>
            <strong className="font-medium text-ink-soft">Usuário</strong>: só visualiza a aba Prompt de cada agente e a base de conhecimento.
          </li>
        </ul>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <Eyebrow tone={pending.length ? "warn" : "faint"}>Aguardando aprovação ({pending.length})</Eyebrow>
          {pending.length === 0 ? (
            <p className="text-[13px] text-ink-faint">Nenhum cadastro pendente.</p>
          ) : (
            <ul className="divide-y divide-line">
              {pending.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-ink">{u.name}</p>
                    <p className="text-[12px] text-ink-faint">
                      {u.email} · cadastrado em {u.createdAt}
                    </p>
                  </div>
                  <UserRowActions user={u} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <Eyebrow>Contas ({others.length})</Eyebrow>
          <ul className="divide-y divide-line">
            {others.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[14px] font-medium text-ink">{u.name}</span>
                    {u.isMe && <span className="text-[11px] text-ink-faint">(você)</span>}
                    <Pill tone={u.role === "ADMIN" ? "accent" : u.role === "CURADORIA" ? "added" : "neutral"}>{ROLE_LABELS[u.role]}</Pill>
                    {u.status === "BLOQUEADO" && <Pill tone="removed">Bloqueado</Pill>}
                    {u.locked && <Pill tone="warn">Travado por tentativas</Pill>}
                    {u.mustChangePassword && <Pill tone="warn">Senha provisória</Pill>}
                  </div>
                  <p className="text-[12px] text-ink-faint">
                    {u.email} · último acesso: {u.lastLoginAt ?? "nunca"}
                    {u.approvedBy ? ` · aprovado por ${u.approvedBy}` : ""}
                  </p>
                </div>
                {!u.isMe && <UserRowActions user={u} />}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
