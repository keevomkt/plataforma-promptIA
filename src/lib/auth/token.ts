/**
 * Token de sessão assinado (HMAC-SHA256), verificável tanto no middleware
 * (Edge) quanto no servidor (Node), sem consultar o banco:
 *
 *   base64url(userId.sessionVersion.expiraEmSegundos).base64url(assinatura)
 *
 * O middleware só confere assinatura e validade; o servidor confere também
 * se a conta continua ativa e se a versão da sessão bate com a do banco.
 */
export const SESSION_COOKIE = "keevo_sessao";
export const SESSION_DAYS = 7;

export type SessionPayload = { userId: string; version: number; expiresAt: number };

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string) {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export function authSecret(): string | undefined {
  const s = process.env.AUTH_SECRET;
  return s && s.length >= 32 ? s : undefined;
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = b64url(enc.encode(`${payload.userId}.${payload.version}.${payload.expiresAt}`));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined, secret: string | undefined): Promise<SessionPayload | null> {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const [userId, version, exp] = new TextDecoder().decode(fromB64url(body)).split(".");
    const payload = { userId, version: Number(version), expiresAt: Number(exp) };
    if (!userId || !Number.isInteger(payload.version) || !Number.isFinite(payload.expiresAt)) return null;
    if (payload.expiresAt * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
