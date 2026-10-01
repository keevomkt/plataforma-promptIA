import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { ChangePasswordForm } from "@/components/auth/AuthForms";

/** Fica fora do grupo com menu lateral: é aqui que cai quem precisa trocar a senha provisória. */
export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const forced = user.mustChangePassword;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[18px] font-semibold text-ink">{forced ? "Crie uma nova senha" : "Minha conta"}</h1>
        <p className="text-[13px] text-ink-faint">
          {forced ? "Você entrou com uma senha provisória. Antes de continuar, defina a sua própria senha." : `${user.name} · ${user.email}`}
        </p>
      </div>
      <ChangePasswordForm forced={forced} />
      {!forced && (
        <p className="text-center text-[13px]">
          <Link href="/" className="text-accent hover:underline">
            ← Voltar para a plataforma
          </Link>
        </p>
      )}
    </div>
  );
}
