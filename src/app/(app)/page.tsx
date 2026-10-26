import Link from "next/link";
import { redirect } from "next/navigation";
import { listPrompts } from "@/lib/data";
import { requireUser } from "@/lib/auth/session";
import { NewPromptForm } from "@/components/NewPromptForm";

export default async function HomePage({ searchParams }: { searchParams: { novo?: string } }) {
  const [user, prompts] = await Promise.all([requireUser(), listPrompts()]);
  // Cadastrar agente é só para administradores; os demais vão direto para o primeiro agente
  const canCreate = user.role === "ADMIN";
  if (prompts.length > 0 && (!searchParams.novo || !canCreate)) redirect(`/p/${prompts[0].slug}`);

  if (!canCreate) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-lg font-semibold text-ink">Nenhum agente cadastrado ainda</h1>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">
          Assim que um administrador cadastrar o prompt de um agente, ele aparece aqui. Enquanto isso, você pode consultar a{" "}
          <Link href="/conhecimento" className="font-medium text-accent hover:underline">
            base de conhecimento
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-lg font-semibold text-ink">
        {prompts.length ? "Cadastrar outro prompt" : "Cadastre o prompt do seu agente"}
      </h1>
      <p className="mt-1 max-w-prose text-sm text-ink-soft">
        Importe o prompt real usado hoje em produção. Ele é guardado exatamente como está, sem resumo nem
        reorganização, e vira a <strong className="font-medium text-ink">v1</strong>. A partir daí, toda alteração é
        solicitada, analisada, aprovada, aplicada, validada e versionada aqui.
      </p>
      <div className="mt-6">
        <NewPromptForm />
      </div>
    </div>
  );
}
