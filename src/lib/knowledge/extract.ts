
/**
 * No Vercel, cada requisição aceita no máximo 4,5 MB de corpo; localmente
 * o limite é maior. Os arquivos são enviados um por requisição.
 */
export const MAX_FILE_MB = process.env.VERCEL ? 4 : 15;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".markdown", ".csv", ".json"];

export type Extracted = { text: string; mimeType: string };

function extensionOf(name: string) {
  const m = /\.[^.]+$/.exec(name.toLowerCase());
  return m ? m[0] : "";
}

/** Texto puro: UTF-8 por padrão, Windows-1252 quando o arquivo não é UTF-8 válido (comum em .txt/.csv do Excel). */
function decodeText(buf: Buffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buf).replace(/^﻿/, "");
  if (!utf8.includes("�")) return utf8;
  return new TextDecoder("windows-1252").decode(buf);
}

/**
 * Extrai o texto de um arquivo da base de conhecimento. O arquivo original
 * é guardado à parte; o texto extraído é o que a busca e a análise usam.
 */
export async function extractText(fileName: string, buf: Buffer): Promise<Extracted> {
  const ext = extensionOf(fileName);
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    throw new Error(`Formato “${ext || "sem extensão"}” não suportado. Use ${ACCEPTED_EXTENSIONS.join(", ")}.`);
  }
  if (buf.length > MAX_FILE_BYTES) {
    throw new Error(`Arquivo maior que ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  }

  let text: string;
  let mimeType: string;
  if (ext === ".pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text: pages } = await pdfText(pdf, { mergePages: false });
    text = (Array.isArray(pages) ? pages : [pages]).map((p) => p.trim()).join("\n\n");
    mimeType = "application/pdf";
  } else if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: buf });
    text = result.value;
    mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else {
    text = decodeText(buf);
    mimeType = ext === ".json" ? "application/json" : ext === ".csv" ? "text/csv" : ext === ".txt" ? "text/plain" : "text/markdown";
  }

  text = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  if (!text) {
    throw new Error(
      ext === ".pdf"
        ? "Não foi possível extrair texto deste PDF (provavelmente é uma imagem digitalizada). Envie uma versão com texto selecionável."
        : "O arquivo não contém texto."
    );
  }
  return { text, mimeType };
}
