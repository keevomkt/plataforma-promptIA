import { getCurrentVersion, getPromptBySlug } from "@/lib/data";
import { PromptWorkspace } from "@/components/PromptWorkspace";
import { resolveUnit } from "@/lib/brand";
import { requireUser } from "@/lib/auth/session";

export default async function PromptPage({ params }: { params: { slug: string } }) {
  const [user, prompt] = await Promise.all([requireUser(), getPromptBySlug(params.slug)]);
  const version = await getCurrentVersion(prompt.id);
  if (!version) return <p className="p-6 text-sm text-ink-faint">Este prompt ainda não tem versão.</p>;

  return (
    <PromptWorkspace
      // Remonta o editor quando uma nova versão vira a atual
      key={version.id}
      promptId={prompt.id}
      slug={prompt.slug}
      versionId={version.id}
      versionNumber={version.version}
      content={version.content}
      temperature={version.temperature}
      topP={version.topP}
      unit={resolveUnit(prompt.businessUnit)?.id ?? null}
      readOnly={user.role !== "ADMIN"}
    />
  );
}
