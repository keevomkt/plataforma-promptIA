"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Form";
import { Card, CardBody, CardHeader, Eyebrow } from "@/components/ui/Surfaces";
import { createPrompt } from "@/lib/actions/prompts";
import { parsePrompt, sectionLabel, structureSummary, visibleSections } from "@/lib/engine/parse";
import { formatCount } from "@/lib/tokens";
import clsx from "clsx";
import { BUSINESS_UNITS, UNIT_IDS, type BusinessUnitId } from "@/lib/brand";
import { UnitLogo } from "@/components/Brand";

export function NewPromptForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState<BusinessUnitId | null>(null);
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [temperature, setTemperature] = useState("0.2");
  const [topP, setTopP] = useState("0.9");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const parsed = useMemo(() => (content.trim() ? parsePrompt(content) : null), [content]);
  const summary = parsed ? structureSummary(parsed) : null;

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setContent(String(reader.result ?? ""));
      setFileName(file.name);
      if (!name) setName(file.name.replace(/\.(txt|md|markdown)$/i, ""));
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createPrompt({
        name,
        description,
        businessUnit: unit,
        content,
        temperature: Number(temperature.replace(",", ".")),
        topP: Number(topP.replace(",", ".")),
        sourceLabel: fileName ?? "colado no editor",
      });
      if (result.ok) router.push(`/p/${result.data.slug}`);
      else setError(result.error);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
      <Card>
        <CardBody className="space-y-4">
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Unidade de negócio</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {UNIT_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setUnit(unit === id ? null : id);
                    if (!name) setName(id);
                  }}
                  className={clsx(
                    "flex items-center gap-3 rounded border px-3 py-2.5 text-left transition-colors",
                    unit === id ? "border-accent bg-accent-soft ring-1 ring-accent" : "border-line bg-surface hover:border-line-strong"
                  )}
                >
                  <UnitLogo unit={id} height={28} />
                  <span className="leading-tight">
                    <span className="block text-[13px] font-semibold text-ink">{id}</span>
                    <span className="block text-[11.5px] text-ink-faint">{BUSINESS_UNITS[id].brand}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nome">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Agente Comercial Keevo" />
            </Field>
            <Field label="Descrição (opcional)">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Bot comercial do WhatsApp" />
            </Field>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink-soft">Texto do prompt</span>
              <div className="flex items-center gap-2">
                {fileName && <span className="text-xs text-ink-faint">{fileName}</span>}
                <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" className="hidden" onChange={onFile} />
                <Button size="sm" onClick={() => fileRef.current?.click()}>
                  Importar .txt / .md
                </Button>
              </div>
            </div>
            <Textarea
              rows={18}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setFileName(null);
              }}
              placeholder="Cole aqui o prompt completo, exatamente como está em produção…"
              className="font-mono text-[12.5px] leading-relaxed"
              spellCheck={false}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:max-w-xs">
            <Field label="Temperatura">
              <Input value={temperature} onChange={(e) => setTemperature(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Top P">
              <Input value={topP} onChange={(e) => setTopP(e.target.value)} inputMode="decimal" />
            </Field>
          </div>
          <p className="text-xs text-ink-faint">
            Temperatura e Top P são só registro da configuração do agente em produção; a plataforma não executa nenhum modelo.
          </p>

          {error && <p className="text-sm text-removed">{error}</p>}
          <div className="flex justify-end">
            <Button variant="primary" onClick={submit} disabled={isPending || !content.trim() || !name.trim()}>
              {isPending ? "Salvando…" : "Salvar como v1"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <span className="text-sm font-medium text-ink">Estrutura identificada</span>
        </CardHeader>
        <CardBody className="space-y-3">
          {!summary || !parsed ? (
            <p className="text-sm text-ink-faint">Cole ou importe o prompt para ver os títulos, listas e regras identificados.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
                <dt className="text-ink-faint">Títulos</dt>
                <dd className="text-right font-medium text-ink">{formatCount(summary.titles)}</dd>
                <dt className="text-ink-faint">Subtítulos</dt>
                <dd className="text-right font-medium text-ink">{formatCount(summary.subtitles)}</dd>
                <dt className="text-ink-faint">Itens de lista</dt>
                <dd className="text-right font-medium text-ink">{formatCount(summary.listItems)}</dd>
                <dt className="text-ink-faint">Regras (linhas)</dt>
                <dd className="text-right font-medium text-ink">{formatCount(summary.rules)}</dd>
                <dt className="text-ink-faint">Blocos</dt>
                <dd className="text-right font-medium text-ink">{formatCount(summary.blocks)}</dd>
              </dl>
              <div>
                <Eyebrow>Seções</Eyebrow>
                <ul className="mt-1.5 max-h-72 space-y-0.5 overflow-y-auto text-[13px] text-ink-soft">
                  {visibleSections(parsed).map((s) => (
                    <li key={s.id} style={{ paddingLeft: `${Math.max(0, s.path.length - 1) * 12}px` }} className="truncate">
                      {s.id === 0 ? <span className="italic text-ink-faint">{sectionLabel(s)}</span> : s.title}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
