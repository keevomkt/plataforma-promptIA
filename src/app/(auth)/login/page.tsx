import { redirect } from "next/navigation";
import { getSessionUser, safeNext } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/AuthForms";

export default async function LoginPage({ searchParams }: { searchParams: { next?: string; cadastro?: string } }) {
  if (await getSessionUser()) redirect(safeNext(searchParams.next));
  const notice = searchParams.cadastro === "enviado" ? "Cadastro enviado! Você poderá entrar assim que um administrador aprovar o seu acesso." : undefined;
  return <LoginForm next={searchParams.next} notice={notice} />;
}
