import { NextRequest, NextResponse } from "next/server";

/**
 * Proteção por senha para o ambiente publicado (a plataforma não tem login
 * próprio). Só é ativada quando APP_PASSWORD está definida — localmente,
 * sem essa variável, nada muda.
 *
 * Usa autenticação básica do navegador: ao abrir o link, aparece a janela
 * de usuário e senha. O usuário pode ser qualquer um; vale a senha.
 */
export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (given === password) return NextResponse.next();
    } catch {
      // cabeçalho malformado: cai no pedido de senha abaixo
    }
  }

  return new NextResponse("Acesso restrito ao time da Keevo.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Keevo Prompt Studio", charset="UTF-8"' },
  });
}

export const config = {
  // Arquivos estáticos do Next e as logos não precisam de senha
  matcher: ["/((?!_next/static|_next/image|brand/|icon.png).*)"],
};
