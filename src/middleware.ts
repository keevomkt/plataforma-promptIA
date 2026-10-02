import { NextRequest, NextResponse } from "next/server";
import { authSecret, SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/**
 * Duas barreiras:
 *
 * 1. Senha geral (APP_PASSWORD), opcional: autenticação básica do navegador
 *    na frente de tudo. Útil enquanto não existem contas; depois de criar o
 *    primeiro administrador, pode ser retirada.
 * 2. Login individual: sem sessão válida (assinatura e validade do token),
 *    páginas vão para /login e o resto recebe 401. A situação da conta
 *    (ativa, bloqueada) é conferida no servidor, em cada página e ação.
 */
const PUBLIC_PATHS = ["/login", "/cadastro"];

export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (password && !basicAuthOk(req, password)) {
    return new NextResponse("Acesso restrito ao time da Keevo.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Keevo Prompt IA", charset="UTF-8"' },
    });
  }

  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, authSecret());
  if (session) return NextResponse.next();

  const isPage = req.method === "GET" && !pathname.startsWith("/api/") && !req.headers.get("next-action");
  if (isPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
}

function basicAuthOk(req: NextRequest, password: string): boolean {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  try {
    const decoded = atob(header.slice(6));
    return decoded.slice(decoded.indexOf(":") + 1) === password;
  } catch {
    return false;
  }
}

export const config = {
  // Arquivos estáticos do Next e as logos não passam pelas barreiras
  matcher: ["/((?!_next/static|_next/image|brand/|icon.png|favicon.ico).*)"],
};
