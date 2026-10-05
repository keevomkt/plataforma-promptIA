"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { Card, CardBody, CardHeader, Eyebrow } from "@/components/ui/Surfaces";
import { submitManualEdit, updateParams } from "@/lib/actions/prompts";
import { parsePrompt, structureSummary, visibleSections, type LineKind } from "@/lib/engine/parse";
import { splitSentences } from "@/lib/engine/text";
import { countWords, estimateTokens, formatCount } from "@/lib/tokens";
import { UnitPicker } from "@/components/UnitPicker";
import type { BusinessUnitId } from "@/lib/brand";

const KIND_LABELS: Record<LineKind, string> = {
  heading: "Título de seção",
  bullet: "Item de lista",
  numbered: "Item numerado",
  text: "Parágrafo",
  blank: "Linha em branco",
  separator: "Separador",
  code: "Bloco de código",
};

const editorTheme = EditorView.theme({ "&": { backgroundColor: "transparent" } });

export function PromptWorkspace(props: {
  promptId: string;
  slug: string;
  versionId: string;
  versionNumber: number;
  content: string;
  temperature: number;
  topP: number;
  unit: BusinessUnitId | null;
}) {
  const router = useRouter();
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState(props.content);
  const [cursorLine, setCursorLine] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isSaving, startSaving] = useTransition();

  const dirty = content !== props.content;
  const parsed = useMemo(() => parsePrompt(content), [content]);
  const sections = useMemo(() => visibleSections(parsed), [parsed]);
  const summary = useMemo(() => structureSummary(parsed), [parsed]);

  const cursorListener = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        if (update.selectionSet || update.docChanged) {
          const pos = update.state.selection.main.head;
          setCursorLine(update.state.doc.lineAt(pos).number - 1);
        }
      }),
    []
  );

  const extensions = useMemo(
    () => [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      search({ top: true }),
      highlightSelectionMatches(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      markdown(),
      editorTheme,
      EditorView.lineWrapping,
      cursorListener,
    ],
    [cursorListener]
  );

  const goToLine = useCallback((index: number) => {
    const view = editorRef.current?.view;
    if (!view) return;
    const line = view.state.doc.line(Math.min(index + 1, view.state.doc.lines));
    view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: 60 }) });
    view.focus();
  }, []);

  function openSearch() {
    const view = editorRef.current?.view;
    if (view) openSearchPanel(view);
  }

  async function copy() {
    await navigator.clipboard.writeText(content);
    setMessage({ kind: "ok", text: "Prompt copiado para a área de transferência." });
  }

  function exportAs(ext: "txt" | "md") {
    const blob = new Blob([content], { type: ext === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${props.slug}-v${props.versionNumber}${dirty ? "-editado" : ""}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setContent(String(reader.result ?? ""));
      setMessage({ kind: "ok", text: `“${file.name}” carregado no editor. Revise e clique em “Revisar e salvar edição” para gerar a nova versão.` });
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  function submitEdit() {
    setMessage(null);
    startSaving(async () => {
      const result = await submitManualEdit({ promptId: props.promptId, baseVersionId: props.versionId, content });
      if (result.ok) router.push(`/p/${props.slug}/alterar/${result.data.changeId}`);
      else setMessage({ kind: "error", text: result.error });
    });
  }

  const line = cursorLine !== null ? parsed.lines[cursorLine] : undefined;
  const lineSection = line ? parsed.sections[line.sectionId] : undefined;
  const sentences = line && line.kind !== "heading" && line.text ? splitSentences(line.text) : [];
  const changeHref =
    line && lineSection && line.text && line.kind !== "blank"
      ? `/p/${props.slug}/alterar?pedido=${encodeURIComponent(
          line.kind === "heading" ? `Na seção “${line.text}”, quero ` : `Na seção “${lineSection.title}”, altere a regra “${line.text}”: `
        )}`
      : null;

  return (
    <div className="flex h-full min-h-0">
      {/* Navegação por seções */}
      <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-line bg-surface py-3 lg:block">
        <Eyebrow className="px-4 pb-1.5">Seções</Eyebrow>
        <ul>
          {sections.map((s) => {
            const active = lineSection?.id === s.id;
            return (
              <li key={s.id}>
                <button
                  onClick={() => goToLine(s.headingLine >= 0 ? s.headingLine : 0)}
                  className={clsx(
                    "block w-full truncate py-1 pr-3 text-left text-[12.5px] hover:bg-sunken",
                    active ? "font-medium text-accent-strong" : s.path.length <= 1 ? "text-ink" : "text-ink-soft"
                  )}
                  style={{ paddingLeft: `${16 + Math.max(0, s.path.length - 1) * 12}px` }}
                  title={s.path.join(" › ") || s.title}
                >
                  {s.id === 0 ? <span className="italic text-ink-faint">Início do prompt</span> : s.title}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Editor */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2">
          <div className="flex items-center gap-3 text-xs text-ink-faint">
            <span>{formatCount(parsed.lines.length)} linhas</span>
            <span>·</span>
            <span>{formatCount(countWords(content))} palavras</span>
            <span>·</span>
            <span>~{formatCount(estimateTokens(content))} tokens</span>
            {dirty && <span className="rounded-sm border border-warn-border bg-warn-bg px-1.5 py-0.5 text-warn">Edição não salva</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button size="sm" variant="ghost" onClick={openSearch}>
              Buscar
            </Button>
            <Button size="sm" variant="ghost" onClick={copy}>
              Copiar
            </Button>
            <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" className="hidden" onChange={onFile} />
            <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
              Importar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exportAs("txt")}>
              Exportar .txt
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exportAs("md")}>
              Exportar .md
            </Button>
            {dirty && (
              <Button size="sm" variant="ghost" onClick={() => setContent(props.content)}>
                Descartar edição
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={submitEdit} disabled={!dirty || isSaving}>
              {isSaving ? "Validando…" : "Revisar e salvar edição"}
            </Button>
          </div>
        </div>
        {message && (
          <div
            className={clsx(
              "border-b px-4 py-2 text-xs",
              message.kind === "ok" ? "border-added-border bg-added-bg text-added" : "border-removed-border bg-removed-bg text-removed"
            )}
          >
            {message.text}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto">
          <CodeMirror ref={editorRef} value={content} onChange={setContent} extensions={extensions} basicSetup={false} height="100%" />
        </div>
      </section>

      {/* Inspetor + parâmetros */}
      <aside className="hidden w-80 shrink-0 space-y-4 overflow-y-auto border-l border-line bg-paper p-4 xl:block">
        <Card>
          <CardHeader className="py-2.5">
            <span className="text-sm font-medium text-ink">Regra selecionada</span>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            {!line ? (
              <p className="text-ink-faint">Clique em uma linha do prompt para ver a seção e a regra correspondentes.</p>
            ) : (
              <>
                <div>
                  <Eyebrow>Seção</Eyebrow>
                  <p className="mt-0.5 text-ink">{lineSection?.path.length ? lineSection.path.join(" › ") : "Início do prompt (sem título)"}</p>
                </div>
                <div className="flex gap-6">
                  <div>
                    <Eyebrow>Linha</Eyebrow>
                    <p className="mt-0.5 font-mono text-ink">{line.index + 1}</p>
                  </div>
                  <div>
                    <Eyebrow>Tipo</Eyebrow>
                    <p className="mt-0.5 text-ink">{KIND_LABELS[line.kind]}</p>
                  </div>
                </div>
                {line.kind !== "blank" && line.kind !== "separator" && (
                  <div>
                    <Eyebrow>{line.kind === "heading" ? "Título" : "Regra"}</Eyebrow>
                    {sentences.length > 1 ? (
                      <ul className="mt-1 space-y-1">
                        {sentences.map((s, i) => (
                          <li key={i} className="rounded border border-line bg-sunken px-2 py-1 text-[13px] text-ink">
                            {s}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 rounded border border-line bg-sunken px-2 py-1 text-[13px] text-ink">&ldquo;{line.text}&rdquo;</p>
                    )}
                  </div>
                )}
                {changeHref && !dirty && (
                  <Link href={changeHref} className="inline-block text-xs font-medium text-accent hover:underline">
                    Pedir alteração nesta regra →
                  </Link>
                )}
              </>
            )}
          </CardBody>
        </Card>

        <ParamsCard {...props} />

        <Card>
          <CardHeader className="py-2.5">
            <span className="text-sm font-medium text-ink">Estrutura identificada</span>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-y-1 text-[13px]">
              <dt className="text-ink-faint">Títulos</dt>
              <dd className="text-right text-ink">{summary.titles}</dd>
              <dt className="text-ink-faint">Subtítulos</dt>
              <dd className="text-right text-ink">{summary.subtitles}</dd>
              <dt className="text-ink-faint">Itens de lista</dt>
              <dd className="text-right text-ink">{summary.listItems}</dd>
              <dt className="text-ink-faint">Regras (linhas)</dt>
              <dd className="text-right text-ink">{summary.rules}</dd>
              <dt className="text-ink-faint">Blocos</dt>
              <dd className="text-right text-ink">{summary.blocks}</dd>
            </dl>
            <p className="mt-2 text-[11.5px] text-ink-faint">
              A estrutura é só lida para navegação e análise; o texto original é mantido como está.
            </p>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

function ParamsCard(props: { promptId: string; versionId: string; versionNumber: number; temperature: number; topP: number; unit: BusinessUnitId | null }) {
  const router = useRouter();
  const [temperature, setTemperature] = useState(String(props.temperature));
  const [topP, setTopP] = useState(String(props.topP));
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const t = Number(temperature.replace(",", "."));
  const p = Number(topP.replace(",", "."));
  const dirty = t !== props.temperature || p !== props.topP;

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateParams({ promptId: props.promptId, baseVersionId: props.versionId, temperature: t, topP: p });
      if (result.ok) {
        setMessage({ kind: "ok", text: `Salvo como v${result.data.version}.` });
        router.refresh();
      } else setMessage({ kind: "error", text: result.error });
    });
  }

  return (
    <Card>
      <CardHeader className="py-2.5">
        <span className="text-sm font-medium text-ink">Configuração do agente</span>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-2 text-[12px]">
          <span className="text-ink-faint">Unidade de negócio</span>
          <UnitPicker promptId={props.promptId} value={props.unit} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[12px] text-ink-faint">Temperatura</span>
            <Input value={temperature} onChange={(e) => setTemperature(e.target.value)} inputMode="decimal" className="mt-1 font-mono" />
          </label>
          <label className="block">
            <span className="text-[12px] text-ink-faint">Top P</span>
            <Input value={topP} onChange={(e) => setTopP(e.target.value)} inputMode="decimal" className="mt-1 font-mono" />
          </label>
        </div>
        <p className="text-[11.5px] text-ink-faint">
          Só metadados: a plataforma não executa o agente. Mudar os valores gera uma nova versão, para manter o histórico.
        </p>
        {message && <p className={clsx("text-xs", message.kind === "ok" ? "text-added" : "text-removed")}>{message.text}</p>}
        {dirty && (
          <Button size="sm" variant="primary" onClick={save} disabled={isPending} className="w-full">
            {isPending ? "Salvando…" : "Salvar como nova versão"}
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
