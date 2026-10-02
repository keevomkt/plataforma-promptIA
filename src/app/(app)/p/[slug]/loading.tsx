import { PageLoading } from "@/components/ui/PageLoading";

/** Dentro de um prompt: cabeçalho e abas continuam na tela; só o conteúdo da aba mostra o carregamento. */
export default function Loading() {
  return <PageLoading variant="tab" />;
}
