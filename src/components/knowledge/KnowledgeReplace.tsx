"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { Card, CardBody, CardHeader } from "@/components/ui/Surfaces";

/** Envia uma versão nova do arquivo; a anterior continua no histórico de revisões. */
export function KnowledgeReplace({ id, maxMb }: { id: string; maxMb: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (!file) return;
    if (file.size > maxMb * 1024 * 1024) {
      setMessage({ ok: false, text: `Arquivo maior que ${maxMb} MB.` });
      return;
    }
    setSending(true);
    setMessage(null);
    const form = new FormData();
    form.set("file", file);
    form.set("note", note);
    try {
      const res = await fetch(`/api/conhecimento/${id}/revisao`, { method: "POST", body: form });
      const data = await res.json();
      if (data.error) setMessage({ ok: false, text: data.error });
      else {
        setMessage({ ok: true, text: `Revisão ${data.revision} salva e em uso.` });
        setFile(null);
        setNote("");
        router.refresh();
      }
    } catch {
      setMessage({ ok: false, text: "Falha no envio." });
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <span className="text-sm font-medium text-ink">Atualizar arquivo</span>
      </CardHeader>
      <CardBody className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <Button size="sm" className="w-full" onClick={() => inputRef.current?.click()}>
          {file ? file.name : "Escolher nova versão do arquivo"}
        </Button>
        {file && <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="O que mudou? (opcional)" className="text-[13px]" />}
        {message && <p className={message.ok ? "text-xs text-added" : "text-xs text-removed"}>{message.text}</p>}
        {file && (
          <Button size="sm" variant="primary" className="w-full" onClick={send} disabled={sending}>
            {sending ? "Enviando…" : "Salvar como nova revisão"}
          </Button>
        )}
        <p className="text-[11.5px] text-ink-faint">A revisão anterior fica guardada e pode voltar a ser usada.</p>
      </CardBody>
    </Card>
  );
}
