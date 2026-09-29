"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Form";
import { Card, CardBody, CardHeader } from "@/components/ui/Surfaces";

/**
 * PASSO 2–4 por diagnóstico: em vez de descrever o pedido, a pessoa cola a
 * conversa real (ou anexa um print) e diz o que era esperado. Isso substitui
 * o fluxo manual de levar prompt + conversa para o Claude à parte — o
 * diagnóstico entra direto na mesma esteira de revisão, diff e versionamento.
 */
export function DiagnoseRequestForm({ slug }: { slug: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [conversation, setConversation] = useState("");
  const [expected, setExpected] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setImage(e.target.files?.[0] ?? null);
    e.target.value = "";
  }

  async function submit() {
    setError(null);
    setIsSending(true);
    const form = new FormData();
    form.set("conversationText", conversation);
    form.set("expectedBehavior", expected);
    if (image) form.set("image", image);
    try {
      const res = await fetch(`/api/p/${slug}/diagnosticar`, { method: "POST", body: form });
      const data = await res.json();
      if (data.error) setError(data.error);
      else router.push(`/p/${slug}/alterar/${data.changeId}`);
    } catch {
      setError("Falha no envio. Tente novamente.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <span className="text-sm font-medium text-ink">Diagnosticar a partir de uma conversa</span>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-xs text-ink-faint">
          Cole a conversa (ou anexe um print de tela) e diga o que o agente deveria ter feito. A IA localiza no prompt a
          regra provável da causa e propõe a menor correção — que passa pela mesma revisão, diff e validação de qualquer
          alteração.
        </p>

        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-ink-soft">Conversa com o lead</span>
          <Textarea
            rows={6}
            value={conversation}
            onChange={(e) => setConversation(e.target.value)}
            placeholder={"Cole aqui a conversa, ex:\nLead: Quanto custa o NG Folha?\nAgente: O valor é R$ 850/mês.\n…"}
            className="font-mono text-[12.5px]"
          />
        </label>

        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            {image ? "Trocar print" : "Ou anexar print de tela"}
          </Button>
          {image && (
            <span className="flex items-center gap-2 text-xs text-ink-faint">
              {image.name}
              <button type="button" onClick={() => setImage(null)} className="text-removed hover:underline">
                remover
              </button>
            </span>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-ink-soft">O que o agente deveria ter feito?</span>
          <Textarea
            rows={3}
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            placeholder="Ex: não deveria informar o valor exato — deveria explicar que um consultor apresentaria a proposta."
          />
        </label>

        {error && <p className="rounded border border-removed-border bg-removed-bg px-3 py-2 text-xs text-removed">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-faint">Nada é alterado agora: primeiro você revisa o diagnóstico e a correção proposta.</p>
          <Button
            variant="primary"
            onClick={submit}
            disabled={isSending || !expected.trim() || (!conversation.trim() && !image)}
          >
            {isSending ? "Diagnosticando… (pode levar até 1 minuto)" : "Diagnosticar"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/** Estado exibido quando ANTHROPIC_API_KEY não está configurada — o resto da plataforma funciona normalmente sem isso. */
export function DiagnoseSetupNotice() {
  return (
    <Card className="border-dashed">
      <CardBody className="space-y-2">
        <span className="text-sm font-medium text-ink">Diagnosticar a partir de uma conversa</span>
        <p className="text-xs text-ink-soft">
          Esta função é opcional e usa a API da Anthropic (Claude) para ler uma conversa real e localizar a causa provável
          no prompt. Para habilitar, defina <code className="rounded bg-sunken px-1 py-0.5 font-mono">ANTHROPIC_API_KEY</code>{" "}
          no arquivo <code className="rounded bg-sunken px-1 py-0.5 font-mono">.env</code> do servidor e reinicie a
          plataforma. Sem isso, o restante da plataforma continua funcionando normalmente com o motor local.
        </p>
      </CardBody>
    </Card>
  );
}
