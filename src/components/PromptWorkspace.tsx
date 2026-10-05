"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { parsePrompt, structureSummary, visibleSections, type LineKind, type PromptSection } from "@/lib/engine/parse";
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
const DETAILS_KEY = "painel-detalhes";
const SECTIONS_KEY = "painel-secoes";

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
  // Painel da direita (regra selecionada, configuração, estrutura): oculto por padrão.
  // Índice de seções: visível por padrão. As duas escolhas ficam lembradas no navegador.
  const [showDetails, toggleDetails] = useRemembered(DETAILS_KEY, false);
  const [showSections, toggleSections] = useRemembered(SECTIONS_KEY, true);

  const dirty = content !== props.content;
  const parsed = useMemo(() => parsePrompt(content), [content]);
  const sections = useMemo(() => visibleSections(parsed), [parsed]);
  const children = useMemo(() => {
    const map = new Map<number | null, PromptSection[]>();
    const ids = new Set(sections.map((x) => x.id));
    for (const sec of sections) {
      const parent = sec.parentId !== null && sec.parentId !== 0 && ids.has(sec.parentId) ? sec.parentId : null;
      map.set(parent, [...(map.get(parent) ?? []), sec]);
    }
    return map;
  }, [sections]);
  // Índice recolhido: só os títulos principais; abre na seta, ou sozinho até a seção onde está o cursor
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
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
  const activeSectionId = lineSection?.id;
  // Cursor dentro de uma subseção: abre o caminho até ela no índice
  useEffect(() => {
    if (activeSectionId === undefined) return;
    const chain: number[] = [];
    let cur = parsed.sections[activeSectionId]?.parentId ?? null;
    while (cur !== null && cur !== 0) {
      chain.push(cur);
      cur = parsed.sections[cur]?.parentId ?? null;
    }
    if (chain.length) setExpanded((prev) => (chain.every((c) => prev.has(c)) ? prev : new Set([...Array.from(prev), ...chain])));
  }, [activeSectionId, parsed]);
  const sentences = line && line.kind !== "heading" && line.text ? splitSentences(line.text) : [];
  const changeHref =
    line && lineSection && line.text && line.kind !== "blank"
      ? `/p/${props.slug}/alterar?pedido=${encodeURIComponent(
          line.kind === "heading" ? `Na seção “${line.text}”, quero ` : `Na seção “${lineSection.title}”, altere a regra “${line.text}”: `
        )}`
      : null;

  return (
    <div className="flex h-full min-h-0">
      {/* Navegação por seções (recolhível) */}
      <aside className={clsx("hidden w-56 shrink-0 overflow-y-auto border-r border-line bg-surface py-3", showSections && "lg:block")}>
        <div className="flex items-center justify-between px-4 pb-1.5">
          <Eyebrow>Seções</Eyebrow>
          {expanded.size > 0 && (
            <button onClick={() => setExpanded(new Set())} className="text-[11px] text-ink-faint hover:text-ink-soft">
              Recolher tudo
            </button>
          )}
        </div>
        <SectionTree
          nodes={children.get(null) ?? []}
          childrenOf={(id) => children.get(id) ?? []}
          depth={0}
          expanded={expanded}
          activeId={lineSection?.id}
          onToggle={(id) =>
            setExpanded((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onGo={(sec) => {
            goToLine(sec.headingLine >= 0 ? sec.headingLine : 0);
            if ((children.get(sec.id) ?? []).length) setExpanded((prev) => new Set(prev).add(sec.id));
          }}
        />
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
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleSections}
              title={showSections ? "Ocultar o índice de seções" : "Mostrar o índice de seções"}
              aria-pressed={showSections}
              className={clsx("hidden lg:inline-flex", showSections && "text-accent")}
            >
              <ListIcon />
              Seções
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleDetails}
              title={showDetails ? "Ocultar detalhes da regra, configuração e estrutura" : "Mostrar detalhes da regra, configuração e estrutura"}
              aria-pressed={showDetails}
              className={clsx("hidden xl:inline-flex", showDetails && "text-accent")}
            >
              <EyeIcon open={showDetails} />
              Detalhes
            </Button>
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
      <aside className={clsx("hidden w-80 shrink-0 space-y-4 overflow-y-auto border-l border-line bg-paper p-4", showDetails && "xl:block")}>
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

/** Preferência de exibição lembrada no navegador (começa no padrão para não divergir do servidor). */
function useRemembered(key: string, initial: boolean): [boolean, () => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) setValue(saved === "1");
    } catch {}
  }, [key]);
  const toggle = useCallback(() => {
    setValue((v) => {
      try {
        localStorage.setItem(key, v ? "0" : "1");
      } catch {}
      return !v;
    });
  }, [key]);
  return [value, toggle];
}

function SectionTree({
  nodes,
  childrenOf,
  depth,
  expanded,
  activeId,
  onToggle,
  onGo,
}: {
  nodes: PromptSection[];
  childrenOf: (id: number) => PromptSection[];
  depth: number;
  expanded: Set<number>;
  activeId?: number;
  onToggle: (id: number) => void;
  onGo: (s: PromptSection) => void;
}) {
  return (
    <ul>
      {nodes.map((sec) => {
        const kids = childrenOf(sec.id);
        const open = expanded.has(sec.id);
        const active = activeId === sec.id;
        return (
          <li key={sec.id}>
            <div className={clsx("flex items-center pr-2 hover:bg-sunken", active && "bg-accent-soft/50")} style={{ paddingLeft: 6 + depth * 12 }}>
              {kids.length ? (
                <button
                  onClick={() => onToggle(sec.id)}
                  className="flex h-6 w-5 shrink-0 items-center justify-center text-ink-faint hover:text-ink"
                  aria-label={(open ? "Recolher " : "Abrir ") + sec.title}
                  aria-expanded={open}
                >
                  <svg viewBox="0 0 12 12" width="10" height="10" className={clsx("transition-transform", open && "rotate-90")} aria-hidden>
                    <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : (
                <span className="w-5 shrink-0" />
              )}
              <button
                onClick={() => onGo(sec)}
                className={clsx(
                  "min-w-0 flex-1 truncate py-1 text-left text-[12.5px]",
                  active ? "font-medium text-accent-strong" : depth === 0 ? "text-ink" : "text-ink-soft"
                )}
                title={sec.path.join(" › ") || sec.title}
              >
                {sec.id === 0 ? <span className="italic text-ink-faint">Início do prompt</span> : sec.title}
                {kids.length > 0 && !open && <span className="ml-1 text-[11px] text-ink-faint">({kids.length})</span>}
              </button>
            </div>
            {open && kids.length > 0 && (
              <SectionTree nodes={kids} childrenOf={childrenOf} depth={depth + 1} expanded={expanded} activeId={activeId} onToggle={onToggle} onGo={onGo} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M7 5h10M7 10h10M7 15h10" strokeLinecap="round" />
      <circle cx="3.5" cy="5" r="0.9" fill="currentColor" />
      <circle cx="3.5" cy="10" r="0.9" fill="currentColor" />
      <circle cx="3.5" cy="15" r="0.9" fill="currentColor" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M1.8 10S4.8 4.5 10 4.5 18.2 10 18.2 10 15.2 15.5 10 15.5 1.8 10 1.8 10Z" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="2.6" />
      {!open && <path d="M3 17 17 3" strokeLinecap="round" />}
    </svg>
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
