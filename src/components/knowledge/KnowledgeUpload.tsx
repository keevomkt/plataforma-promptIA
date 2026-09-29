"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Card, CardBody, CardHeader } from "@/components/ui/Surfaces";
import { KNOWLEDGE_CATEGORIES } from "@/lib/engine/types";
import { UNIT_IDS } from "@/lib/brand";
import { UnitLogo } from "@/components/Brand";

const ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.csv,.json";

export function KnowledgeUpload({ units, maxMb }: { units: string[]; maxMb: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("PRODUTOS");
  const [description, setDescription] = useState("");
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: string[]; errors: { fileName: string; error: string }[] } | null>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list);
    setFiles((prev) => [...prev, ...next.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
    setResult(null);
  }

  // Um arquivo por requisição: no Vercel cada requisição tem limite de tamanho
  async function send() {
    setSending(true);
    setResult(null);
    const ok: string[] = [];
    const errors: { fileName: string; error: string }[] = [];
    const failed: File[] = [];
    for (const file of files) {
      if (file.size > maxMb * 1024 * 1024) {
        errors.push({ fileName: file.name, error: `Arquivo maior que ${maxMb} MB.` });
        failed.push(file);
        continue;
      }
      const form = new FormData();
      form.set("businessUnit", unit);
      form.set("category", category);
      form.set("description", description);
      form.append("files", file);
      try {
        const res = await fetch("/api/conhecimento", { method: "POST", body: form });
        const data = await res.json().catch(() => ({ error: `Falha no envio (erro ${res.status}).` }));
        if (data.error) {
          errors.push({ fileName: file.name, error: data.error });
          failed.push(file);
        } else {
          ok.push(...data.created.map((c: { title: string }) => c.title));
          for (const e of data.errors) {
            errors.push(e);
            failed.push(file);
          }
        }
      } catch {
        errors.push({ fileName: file.name, error: "Falha no envio. Tente novamente." });
        failed.push(file);
      }
    }
    setResult({ ok, errors });
    // Mantém na lista só o que falhou, para tentar de novo
    setFiles(failed);
    if (!failed.length) setDescription("");
    if (ok.length) router.refresh();
    setSending(false);
  }

  return (
    <Card>
      <CardHeader>
        <span className="text-sm font-medium text-ink">Adicionar documentos</span>
      </CardHeader>
      <CardBody className="space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={clsx(
            "cursor-pointer rounded border-2 border-dashed px-4 py-6 text-center transition-colors",
            dragging ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong"
          )}
        >
          <p className="text-sm text-ink">Arraste os arquivos aqui ou clique para escolher</p>
          <p className="mt-1 text-xs text-ink-faint">PDF, Word (.docx), TXT, Markdown, CSV ou JSON · até {maxMb} MB cada · vários de uma vez</p>
          <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>

        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f) => (
              <li key={f.name + f.size} className="flex items-center justify-between rounded border border-line bg-sunken px-3 py-1.5 text-[13px]">
                <span className="truncate text-ink">{f.name}</span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-ink-faint">
                  {(f.size / 1024).toFixed(0)} KB
                  <button type="button" onClick={() => setFiles((prev) => prev.filter((p) => p !== f))} className="text-removed hover:underline">
                    remover
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-ink-soft">Unidade:</span>
          {UNIT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setUnit(id)}
              className={clsx(
                "flex items-center gap-2 rounded border px-2 py-1 text-[12.5px] transition-colors",
                unit.trim().toUpperCase() === id ? "border-accent bg-accent-soft text-accent-strong ring-1 ring-accent" : "border-line bg-surface text-ink-soft hover:border-line-strong"
              )}
            >
              <UnitLogo unit={id} height={20} />
              <span className="font-semibold">{id}</span>
            </button>
          ))}
          <span className="text-xs text-ink-faint">ou digite outra (ex: Institucional)</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Unidade de negócio" hint="Ex: HCM, ERP, EC, Institucional">
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} list="kb-units" placeholder="Digite ou escolha" />
            <datalist id="kb-units">
              {Array.from(new Set([...UNIT_IDS, ...units])).map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </Field>
          <Field label="Categoria">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {Object.entries(KNOWLEDGE_CATEGORIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Descrição (opcional)">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Catálogo de módulos 2026" />
          </Field>
        </div>

        {result && (
          <div className="space-y-1 text-xs">
            {result.ok.length > 0 && <p className="text-added">✓ {result.ok.length} documento(s) adicionado(s): {result.ok.join(", ")}</p>}
            {result.errors.map((e, i) => (
              <p key={i} className="text-removed">
                ✕ {e.fileName ? `${e.fileName}: ` : ""}
                {e.error}
              </p>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="primary" onClick={send} disabled={sending || !files.length || !unit.trim()}>
            {sending ? "Enviando e extraindo texto…" : `Enviar ${files.length || ""} arquivo(s)`}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
