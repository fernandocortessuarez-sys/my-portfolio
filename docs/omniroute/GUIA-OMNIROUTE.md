# Guia OmniRoute + Skills do Claude Code

> Analisado em 2026-10-09 no commit `4ea24a2` de
> [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) (v3.8.52, licença MIT).

## 1. O que é o OmniRoute

O OmniRoute é um **gateway de IA local**: um servidor (Node.js + Next.js + SQLite) que
roda no seu computador em `http://localhost:20128`. Em vez de cada ferramenta (Claude
Code, Cursor, Codex, Cline, scripts) falar direto com a Anthropic, OpenAI, Google etc.,
todas falam com o OmniRoute, e ele decide para qual provedor mandar.

```
Claude Code / Cursor / scripts
          │  (uma URL, uma chave)
          ▼
  OmniRoute  localhost:20128
   ├─ roteamento ("combos", 19 estratégias: prioridade, round-robin, custo…)
   ├─ fallback automático (se um provedor cai ou estoura a cota, tenta o próximo)
   ├─ compressão de prompt (RTK, Caveman…) → menos tokens
   ├─ cache, limites de gasto, logs de uso, painel web
   └─ chaves/OAuth de todos os provedores guardadas num SQLite local
          ▼
  ~370 provedores (Anthropic, OpenAI, Gemini, Groq, Mistral, OpenRouter, tiers grátis…)
```

O que ele expõe: API compatível com OpenAI (`/v1/*`), API compatível com Anthropic (para
o Claude Code), servidor MCP com 110 ferramentas (`/api/mcp/stream`), protocolo A2A, CLI
`omniroute` e um dashboard web.

## 2. Vantagens reais

| Vantagem | Quando faz diferença |
| --- | --- |
| Uma única URL/chave para muitos modelos | Você usa vários provedores e cansou de configurar cada ferramenta |
| Fallback automático | Rate limit ou queda de um provedor não interrompe seu trabalho |
| Tiers grátis empilhados | Estudo/experimentos sem gastar (qualidade varia muito entre modelos grátis) |
| Compressão de tokens | Conversas longas de agente ficam mais baratas |
| Painel de custos e limites | Controlar gasto por chave, ver o que cada ferramenta consome |
| Usar outros modelos dentro do Claude Code | Testar GLM, Kimi, GPT etc. com a interface do Claude Code |

Quando **não** vale a pena: se você só usa Claude com a assinatura/conta oficial, o
OmniRoute adiciona uma peça a mais (latência, manutenção, um lugar a mais com suas
chaves) sem grande ganho.

## 3. O que ele faz no seu computador

Ao instalar (`npm i -g omniroute`):

- Baixa o pacote npm e roda um `postinstall` (`scripts/build/postinstall.mjs`) que prepara
  módulos nativos: copia/repara binários de `better-sqlite3`, `wreq-js`, `sql.js` e
  `node-machine-id`, pode rodar `npm rebuild better-sqlite3` (que às vezes baixa um binário
  pré-compilado do npm/GitHub) e pode ajustar um arquivo de cache do `node-gyp` na sua pasta
  de usuário. Revisei o script: nada malicioso, nada envia seus dados.
- Cria uma pasta de dados local: `~/.omniroute` (Linux/macOS) ou `%APPDATA%\omniroute`
  (Windows), ou o que estiver em `DATA_DIR`. Lá ficam o banco `storage.sqlite` (provedores,
  chaves, logs) e as configurações.

Ao rodar (`omniroute serve`):

- Abre um servidor HTTP na porta **20128**. ⚠️ **Por padrão ele escuta em `0.0.0.0`**, ou
  seja, em **todas** as interfaces de rede, não só no seu computador (`bin/cli/utils/serverHost.mjs`).
  Como a API de inferência não exige chave por padrão, qualquer pessoa no mesmo Wi-Fi
  (casa, café, empresa) pode usar sua cota. O próprio projeto registrou isso como alerta de
  segurança (GHSA-wmgv-ph3p-rv57). **Solução:** iniciar com `OMNIROUTE_SERVER_HOST=127.0.0.1`
  (veja a seção 7).
- Faz chamadas de rede para os provedores que **você** configurar.
- O recurso "Radar" (catálogo de tiers grátis, `radar.omniroute.online`) é marcado como
  opcional no README.

Recursos que mexem no sistema **apenas se você ativar**:

- **MITM / interceptação TLS** (`src/mitm/`): instala um certificado raiz na sua máquina,
  edita `/etc/hosts` e pede `sudo`. Serve para capturar o tráfego de certas ferramentas.
  É o recurso mais sensível do projeto — recomendo **não ativar**.
- **Túneis** (ngrok/Cloudflare): expõem seu gateway na internet.
- **Autostart / bandeja do sistema**: inicia junto com o computador.

## 4. Revisão de segurança feita

| Verificação | Resultado |
| --- | --- |
| Prompt injection nas 46 skills + README, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `llm.txt` | Nada encontrado (padrões "ignore previous", exfiltração, `curl \| sh`, `.ssh`, `eval` etc.) |
| Caracteres Unicode invisíveis (técnica de injeção escondida) | Nenhum em 51 arquivos |
| Script de instalação (`postinstall`) | Nada malicioso; prepara módulos nativos (detalhes na seção 3) |
| Domínios citados nas skills | `localhost`, `raw.githubusercontent.com`, `github.com` — nada suspeito |
| Vírus/trojan | Nenhum indício; é código-fonte aberto, mas é enorme (25 mil arquivos), então a revisão foi por amostragem dos pontos de risco, não linha a linha |

**Pontos de atenção (decisão sua):**

1. **Termos de uso.** Parte dos provedores "grátis" funciona reaproveitando logins de
   assinaturas de consumidor (Claude, ChatGPT, Gemini/Antigravity) e imitando o cliente
   oficial ("TLS stealth", cabeçalhos do Claude Code). Isso pode violar os termos desses
   serviços e levar a **suspensão da conta**. O próprio projeto mantém um catálogo de
   "terms-risk" marcando 13 provedores como "avoid". Prefira provedores com chave de API.
2. **Cofre de credenciais.** Todas as suas chaves ficam num único SQLite local. Proteja o
   computador, ative login no dashboard e não exponha a porta 20128.
3. **MITM.** Ver seção 3 — não ativar sem necessidade real.
4. **Exposição na rede.** O servidor abre para a rede local por padrão (seção 3). Use
   sempre `OMNIROUTE_SERVER_HOST=127.0.0.1`, a menos que queira mesmo acessar de outro aparelho.
5. **Seus prompts passam pelo provedor escolhido.** Tiers grátis frequentemente usam seus
   dados para treino. Não envie código privado/segredos para provedores que você não conhece.
6. **Arquivos do repositório que pedem coisas ao agente:** o `CLAUDE.md` do OmniRoute é
   para quem *desenvolve* o OmniRoute (manda usar `/home/diegosouzapw/...`, worktrees etc.).
   Ele **não** foi copiado para o seu projeto e não deve ser seguido aqui.

## 5. O que foi instalado no seu repositório (e por quê)

Tudo dentro de `my-portfolio`:

| Arquivo | O que faz |
| --- | --- |
| `CLAUDE.md` | Carregado automaticamente em toda sessão do Claude Code neste repo. Define: responder em pt-BR com detalhe, rodar o `review-loop` antes de dizer "pronto", e as regras de segurança com conteúdo de terceiros. |
| `.claude/skills/omniroute/SKILL.md` | Skill escrita para você. Ensina o Claude a verificar se o servidor está rodando, apontar o Claude Code para ele, chamar a API e — principalmente — as regras de segurança (não ativar MITM, não expor, não vazar chaves, avisar sobre termos de uso). |
| `.claude/skills/omniroute/references/omni-inference.md` | Cópia oficial da skill de inferência (endpoints `/v1`). Só é lida quando necessária ("progressive disclosure"), então não gasta tokens à toa. |
| `.claude/skills/omniroute/references/cli-serve.md` | Cópia oficial: todos os comandos `omniroute serve/stop/restart…`. |
| `.claude/skills/omniroute/references/omni-auth.md` | Cópia oficial: autenticação, API keys, login. |
| `.claude/skills/omniroute/references/LICENSE-omniroute.txt` | Licença MIT do OmniRoute (exigida ao copiar). |
| `.claude/skills/ponytail/SKILL.md` + `LICENSE` | Skill de terceiros (MIT, © 2026 DietrichGebert; a licença original foi copiada junto, como o MIT exige) que força a solução mais simples que funciona: reutilizar o que existe, biblioteca padrão antes de dependência, sem abstrações desnecessárias — sem cortar validação, segurança ou acessibilidade. |
| `.claude/skills/review-loop/SKILL.md` | O seu fluxo de qualidade: 3 subagentes revisores com papéis escolhidos para cada mudança + 1 juiz que decide PRONTO/NÃO PRONTO, com no máximo 3 rodadas. |
| `docs/omniroute/GUIA-OMNIROUTE.md` | Este guia. |

### Por que não instalei as 46 skills do OmniRoute

O Claude Code carrega o `name` + `description` de **todas** as skills em toda sessão.
46 skills = muitas descrições competindo e gastando contexto, e várias são geradas
automaticamente com conteúdo vazio (ex.: `omni-github-skills` diz "No endpoints mapped").
Selecionei as 3 mais úteis como referência dentro de uma única skill.

## 6. Skill é chamada manualmente ou fica sempre integrada?

As duas coisas:

- **Automática:** em toda sessão, o Claude Code lê só o cabeçalho (`name` e `description`)
  de cada skill em `.claude/skills/`. Quando seu pedido combina com a descrição, ele
  carrega o resto sozinho. Ex.: "inicia o OmniRoute" → ativa `omniroute`.
- **Manual:** você pode forçar com `/omniroute`, `/ponytail ultra`, `/review-loop`.
- **Escopo:** estão no **projeto** (`my-portfolio/.claude/skills/`), então valem para quem
  abrir este repositório. Para valer em **todos** os seus projetos, copie as pastas para
  `~/.claude/skills/` no seu computador.
- O `CLAUDE.md` é sempre carregado — por isso a regra do `review-loop` está lá, para
  não depender de o Claude "lembrar" de chamar a skill.

## 7. O que VOCÊ precisa fazer (eu não consigo fazer daqui)

Eu trabalho num container na nuvem; o OmniRoute precisa rodar **no seu computador**.

1. Instale o Node.js **22.22+ ou 24+** (`node -v` para conferir).
2. `git pull` deste branch no seu computador (ou faça o merge do PR, se abrir um).
3. Instale: `npm i -g omniroute`. Inicie **só para o seu computador**:
   - Linux/macOS: `OMNIROUTE_SERVER_HOST=127.0.0.1 omniroute serve`
   - Windows (PowerShell): `$env:OMNIROUTE_SERVER_HOST="127.0.0.1"; omniroute serve`
4. Abra `http://localhost:20128`, **ative o login/senha** do dashboard e crie uma API key.
5. Adicione provedores **com chave de API** (Anthropic, OpenAI, Groq, OpenRouter…).
   Evite os que usam login de assinatura (ver seção 4).
6. Para usar no Claude Code: `omniroute launch` (ou defina `ANTHROPIC_BASE_URL` e
   `ANTHROPIC_AUTH_TOKEN` — detalhes na skill `omniroute`).
7. (Opcional) Ferramentas MCP do OmniRoute dentro do Claude Code:
   `claude mcp add --transport http omniroute http://localhost:20128/api/mcp/stream`.
   (O README do OmniRoute mostra `claude mcp add-server ... --type`, que **não** é um comando
   válido do Claude Code.)
8. Para desfazer tudo: `omniroute stop`, `npm uninstall -g omniroute`, `claude mcp remove omniroute`
   (se adicionou) e apague a pasta de dados: `~/.omniroute` (Linux/macOS) ou
   `%APPDATA%\omniroute` (Windows). Atenção: isso apaga as chaves salvas nele.

## 8. Skills recomendadas

Já disponíveis no seu ambiente Claude (não precisa instalar):

| Skill | Como funciona | Quando usar |
| --- | --- | --- |
| `skill-creator` | Cria/melhora skills, roda avaliações e otimiza a `description` para disparar no momento certo | Sempre que for criar uma skill nova |
| `code-review` | Revisa o diff atual ou um PR procurando bugs, com nível de esforço configurável | Antes de abrir PR |
| `security-review` | Revisão de segurança das mudanças do branch | Antes de publicar algo sensível |
| `simplify` | Limpa código alterado (reuso, simplificação) e aplica os ajustes | Depois de uma feature grande |
| `run` | Sobe o app e verifica a mudança funcionando de verdade | Validar UI do portfólio |
| `init` | Gera/atualiza o `CLAUDE.md` a partir do código | Projetos novos |
| `update-config` / `fewer-permission-prompts` | Configuram `settings.json`, hooks e permissões | Automatizar "sempre que X, faça Y" |
| `session-start-hook` | Hook que prepara dependências ao iniciar sessões na nuvem | Para lint/testes rodarem em sessões web |

Externas que valem a pena para este portfólio (instalar copiando a pasta para `.claude/skills/`
e **sempre revisando antes**, como fizemos aqui):

- **Anthropic `frontend-design`** (repo `anthropics/skills`): guia o Claude a fazer UI
  com identidade visual, evitando o "visual genérico de IA". Ótima para um portfólio.
- **Anthropic `webapp-testing`**: usa Playwright para testar a aplicação web localmente.
- **Superpowers** (`obra/superpowers`): conjunto de skills de processo (brainstorm →
  plano → TDD → revisão). Combina com o seu `review-loop`.
- **Caveman** (citada pelo próprio `ponytail`): respostas curtíssimas para economizar
  tokens. **Não recomendo para você**, porque conflita com sua preferência por explicações detalhadas.
