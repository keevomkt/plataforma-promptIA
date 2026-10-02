# Keevo Prompt IA

Plataforma interna de **engenharia, manutenção e governança de prompts** dos agentes de IA da Keevo.

A plataforma **não é o bot**: ela não atende clientes, não executa o agente e não depende de nenhuma API de IA. Ela só faz, sobre o texto do prompt real:

**LER → ANALISAR → SUGERIR → ALTERAR → VALIDAR → VERSIONAR**

O prompt versionado é depois entregue (exportado/copiado) para a equipe que integra o agente em produção.

## Como rodar

Pré-requisito: Node.js 20+. Nenhuma chave de API é necessária.

```bash
npm install
cp .env.example .env
npm run db:push     # cria o banco SQLite local
npm run dev         # http://localhost:3000
```

Na primeira abertura, cadastre o prompt real (colar o texto ou importar `.txt`/`.md`). Ele é salvo exatamente como veio e vira a **v1**.

## Fluxo principal

1. **Prompt**: o prompt atual em um editor com numeração de linhas, busca, copiar, importar e exportar. À esquerda fica a navegação pelas seções; à direita, clicar numa linha mostra a **seção** e a **regra** correspondentes. Ali também ficam Temperatura e Top P.
2. **Alterar prompt**: o usuário escreve o que quer mudar ("Não quero mais perguntar quantidade de CNPJs") e clica em **Analisar alteração**. Nada é alterado ainda. A plataforma mostra:
   - solicitação recebida e entendimento;
   - seções afetadas e regras afetadas;
   - regras preservadas;
   - possíveis conflitos;
   - sugestão (com sugestão de regra) e impacto estimado.

   Se o pedido for ambíguo, ela **pergunta antes**. Exemplo: "remover de todo o prompt ou somente do fluxo X?".
3. **Alteração proposta**: cada operação (REMOVER / ADICIONAR / ALTERAR / REVISAR) pode ser marcada, desmarcada ou editada. Os botões são **Aplicar alteração**, **Editar** e **Cancelar**.
4. **Aplicar**: gera o **prompt completo** atualizado, alterando só as linhas necessárias. Em seguida mostra o diff (Removido / Adicionado / Alterado, com contagem de linhas) e roda a **validação automática**.
5. **Salvar como nova versão**: o usuário descreve a alteração e a nova versão é criada com número, data, descrição, prompt completo, Temperatura/Top P e responsável.
6. **Histórico**: linha do tempo das alterações (vX → vY, alteração, impacto, seções, responsável) e lista de versões. Cada versão pode ser visualizada, comparada, restaurada, duplicada ou exportada.

## Base de conhecimento

Em **Base de conhecimento** (barra lateral) ficam os documentos de referência da empresa: produtos de cada unidade de negócio, informações institucionais, termos e regras comerciais.

- **Upload:** PDF (com texto selecionável), Word (.docx), TXT, Markdown, CSV e JSON, até 15 MB cada, vários de uma vez. Cada documento tem unidade de negócio, categoria e descrição.
- **Texto extraído:** é o que a plataforma usa na busca e na análise. O arquivo original fica guardado para download.
- **Revisões:** substituir o arquivo cria uma nova revisão. As anteriores continuam disponíveis e podem voltar a ser usadas.
- **Busca:** encontra trechos no conteúdo dos documentos, com filtro por unidade e categoria.

A base é usada pelo motor, sem nenhuma IA:

- **Na análise de cada alteração**, mostra os trechos da base relacionados ao pedido e aponta como possível conflito qualquer produto ou termo novo que não exista nem no prompt nem na base.
- **Na validação**, a verificação "Produtos e termos novos têm fonte na base de conhecimento" avisa quando a nova versão cita um nome sem fonte.

Edições feitas direto no editor também passam por diff e validação antes de virar versão. Mudar Temperatura/Top P gera uma nova versão, para manter a rastreabilidade.

## Motor de análise (sem IA)

Fica em `src/lib/engine/`. É determinístico e roda localmente:

| Arquivo | Responsabilidade |
|---|---|
| `parse.ts` | Identifica títulos (markdown, CAIXA ALTA, **negrito**), listas, regras, blocos e seções. Só lê o texto; nunca o converte. |
| `text.ts` | Normalização em português: acentos, radicais, sinônimos do domínio e divisão em frases. |
| `intent.ts` | Interpreta o pedido: remover, adicionar, trocar, condicional ("quando o usuário…"), objetividade, tom, menos perguntas. Também extrai o escopo ("do fluxo geral…"). |
| `match.ts` | Encontra as regras afetadas. Termos raros no prompt (ex: "CNPJ", "eKeep") pesam mais que termos comuns. |
| `analyze.ts` | Monta a análise: entendimento, regras afetadas/preservadas, dependências, conflitos, sugestão, impacto, pergunta de esclarecimento e operações propostas. |
| `apply.ts` | Aplica as operações aprovadas linha a linha, conferindo o texto original antes de alterar. Remove só a frase ou o item de enumeração quando possível e renumera listas. |
| `validate.ts` | Valida a nova versão: estrutura, regras fora do escopo, produtos, restrições, URLs, duplicidade, contradições, dependência de informação removida, referências e seções vazias. |

**Regra de preservação:** tudo o que não é alvo de uma operação é copiado byte a byte da versão anterior. Títulos, ordem, terminologia, URLs e quebras de linha não mudam. Na troca de termos, títulos de seção e URLs ficam protegidos por padrão.

### Camada opcional de IA

`src/lib/engine/index.ts` define a interface `PromptAnalyzer`. Para usar um modelo de IA no futuro:

1. crie um analisador que devolva o mesmo `ChangeAnalysis`;
2. registre-o em `getAnalyzer()`.

A aplicação das operações, o diff, a validação, o versionamento e as telas continuam iguais. O motor local segue disponível como alternativa caso a IA falhe. A plataforma funciona completa sem essa camada.

## Estrutura

```
prisma/schema.prisma           Prompt, PromptVersion, ChangeRequest
src/lib/engine/                Motor de análise, aplicação e validação
src/lib/actions/               Server Actions: changes.ts (fluxo de governança), prompts.ts, versions.ts
src/app/p/[slug]/              Prompt · Alterar prompt · Histórico · versões · comparação
src/app/api/p/.../export/      Download de uma versão em .txt/.md
```

## Limitações conhecidas

- **Interpretação por regras, não por IA**: pedidos muito abertos resultam em uma pergunta de esclarecimento ou em uma sugestão de regra que o usuário edita antes de aplicar. Os casos da especificação (remover pergunta, escopo ambíguo, objetividade, encaminhar mais cedo, condicional de preço, trocar termo, adicionar regra) são tratados diretamente.
- **Sem login**: o responsável é o nome informado na barra lateral, guardado em um cookie do navegador.
- **Contagem de tokens** é uma estimativa por caractere (`src/lib/tokens.ts`).
