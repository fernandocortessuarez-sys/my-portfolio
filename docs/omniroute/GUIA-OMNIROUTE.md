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
  (Windows), ou o que estiver em `DATA_DIR`. Detalhe: se a pasta `~/.omniroute` existir, ela
  sempre tem prioridade, também no Windows (`bin/cli/data-dir.mjs`). Por isso o passo 2 da
  seção 7 a cria antes da primeira execução. Lá ficam o banco `storage.sqlite` (provedores,
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
| `docs/claude-global/CLAUDE.md` | Versão geral das regras (português, detalhe, `review-loop`, segurança) para copiar em `~/.claude/CLAUDE.md` e valer em todos os projetos (seção 10). |

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
  abrir este repositório. Para valer em **todos** os seus projetos, siga a seção 10
  (comandos para Windows, incluindo o `CLAUDE.md` global).
- O `CLAUDE.md` é sempre carregado — por isso a regra do `review-loop` está lá, para
  não depender de o Claude "lembrar" de chamar a skill.

## 7. O que VOCÊ precisa fazer (eu não consigo fazer daqui)

Eu trabalho num container na nuvem; o OmniRoute precisa rodar **no seu computador**.
Os comandos abaixo são para **Windows (PowerShell)**; no Linux/macOS a ideia é a mesma.

1. **Node.js 22.22+ ou 24+.** Confira com `node -v`. Se o instalador do Node abriu uma janela
   instalando **Chocolatey** (opção "Tools for Native Modules"), ela **não é necessária** para o
   OmniRoute na maioria dos casos: pode fechá-la. Só volte a ela se o passo 3 falhar com erros de
   `node-gyp`/"Visual Studio Build Tools".
2. **Configuração permanente, antes da primeira execução** (resolve a rede aberta e a senha pública
   de uma vez, e você nunca mais precisa digitar isso):

   ```powershell
   New-Item -ItemType Directory -Force "$HOME\.omniroute" | Out-Null
   Set-Content -Encoding ascii "$HOME\.omniroute\.env" @'
   OMNIROUTE_SERVER_HOST=127.0.0.1
   INITIAL_PASSWORD=TROQUE-POR-UMA-SENHA-FORTE
   '@
   ```

   Ao colar no PowerShell, as linhas que começam com `'@` e `OMNIROUTE…`/`INITIAL…` devem ficar
   **sem espaços no começo**. Use aspas simples (`@'…'@`) como acima: com aspas duplas, um `$`
   dentro da senha seria interpretado e cortaria a senha. Use só letras, números e símbolos comuns
   (sem acentos).

   - `OMNIROUTE_SERVER_HOST=127.0.0.1` → o servidor só aceita conexões do seu próprio computador.
   - `INITIAL_PASSWORD` → senha do painel. Sem isso, o modelo de configuração do projeto usa
     `CHANGEME`, uma senha **pública** (o próprio código avisa, em inglês, que qualquer pessoa
     consegue entrar com ela).
   - Se você **já executou** o OmniRoute antes, ele pode ter criado `%APPDATA%\omniroute`; depois
     deste passo ele passa a usar `~/.omniroute` e começa do zero (a pasta antiga fica esquecida).
   - O OmniRoute lê esse arquivo (`~/.omniroute/.env`) toda vez que inicia (`bin/omniroute.mjs`).
   - Use `Set-Content -Encoding ascii` e não `>`: no PowerShell antigo, `>` grava em UTF-16 e o
     arquivo pode não ser lido.
3. **Instalar:** `npm i -g omniroute`. Se o PowerShell disser que "a execução de scripts foi
   desabilitada", rode uma vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (ou use
   `omniroute.cmd` no lugar de `omniroute`).
4. **Iniciar:** `omniroute serve` e deixe essa janela aberta (é o servidor). Na primeira vez, se
   o Windows perguntar se o Node.js pode acessar redes, pode **negar**: com `127.0.0.1` ele não precisa.
   (Efeito colateral: essa regra vale para o Node.js todo, então, por exemplo, abrir o `npm run dev`
   do portfólio pelo celular na mesma rede deixará de funcionar até você liberar no Firewall.)
5. **O painel ("a parte da web")** é só uma página no seu próprio computador:
   `http://localhost:20128` no navegador. Não existe site externo para configurar. Lá:
   1. entre com a senha do passo 2 e, se pedir, confirme/troque em Settings → Security;
   2. em **Providers**, conecte o que tiver (veja a seção 9 sobre ficar sem chave de API);
   3. em **API Keys**, crie uma chave do OmniRoute (`oma_...`). Guarde-a para o passo 6.
6. **Usar no Claude Code:** numa **segunda** janela do terminal, dentro do projeto:
   `omniroute launch --api-key oma_SUA_CHAVE`. Ele confere se o servidor está de pé e abre o
   `claude` já apontado para o OmniRoute (só aquela janela; seu `claude` normal continua usando o
   plano Pro). Sem `--api-key` ele envia um valor genérico (`omniroute-no-auth`) e a chave criada
   não é usada. Para não digitar a chave toda vez, salve-a uma vez como variável do seu usuário
   (abra um terminal novo depois):

   ```powershell
   [Environment]::SetEnvironmentVariable("OMNIROUTE_API_KEY", "oma_SUA_CHAVE", "User")
   ```

   A partir daí basta `omniroute launch`. **Nunca** salve `ANTHROPIC_BASE_URL` ou
   `ANTHROPIC_AUTH_TOKEN` como variáveis permanentes: isso desviaria **todo** `claude` para o
   OmniRoute e você deixaria de usar o plano Pro sem perceber.
7. (Opcional) Ferramentas MCP do OmniRoute dentro do Claude Code:
   `claude mcp add --transport http omniroute http://localhost:20128/api/mcp/stream`.
   (O README do OmniRoute mostra `claude mcp add-server ... --type`, que **não** é um comando
   válido do Claude Code.)
8. **Para desfazer tudo:** `omniroute stop`, `npm uninstall -g omniroute`,
   `claude mcp remove omniroute` (se adicionou) e apague a pasta `~/.omniroute`
   (`Remove-Item -Recurse "$HOME\.omniroute"`), além de `%APPDATA%\omniroute` se existir.
   Se salvou a chave: `[Environment]::SetEnvironmentVariable("OMNIROUTE_API_KEY", $null, "User")`.
   Atenção: isso apaga as chaves salvas.

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

## 9. Perguntas frequentes (plano Pro, rede, termos, sem chave de API)

### Preciso iniciar o OmniRoute sempre que uso o Claude Code?

**Não.** O Claude Code funciona sozinho com o seu plano Pro. O OmniRoute só precisa estar
rodando quando você **quer** que o Claude Code passe por ele (`omniroute launch`). E a
configuração de rede segura não precisa ser digitada de novo: ela fica no `~/.omniroute/.env`
(seção 7, passo 2) e vale em toda inicialização.

### Por que `127.0.0.1` deixa o servidor fechado para a rede?

Seu computador tem várias "portas de entrada" de rede (interfaces):

| Endereço | Quem consegue chegar |
| --- | --- |
| `127.0.0.1` (loopback) | **Só o próprio computador.** O sistema operacional nunca entrega a essa interface uma conexão vinda de outra máquina. |
| `192.168.x.x` (Wi-Fi/cabo) | Qualquer aparelho na mesma rede: família, colegas, desconhecidos num Wi-Fi público. |
| `0.0.0.0` | Não é um endereço real: significa "escute em **todas** as interfaces acima". É o padrão do OmniRoute. |

Com `OMNIROUTE_SERVER_HOST=127.0.0.1`, o servidor só abre a porta interna. O Claude Code, que
roda no mesmo computador, continua acessando `http://localhost:20128` normalmente (`localhost`
é o nome de `127.0.0.1`). Observação: mesmo em `0.0.0.0` ele não fica exposto à **internet**
inteira (o roteador de casa normalmente bloqueia conexões vindas de fora), e sim à **rede local**. O perigo real é Wi-Fi compartilhado,
onde qualquer um usaria sua cota e, com a senha `CHANGEME`, entraria no painel.

### Vale a pena com o plano Claude Pro?

Para a maioria do uso diário, **não muda muito**: o Pro já inclui o Claude Code e é a melhor
experiência (o Claude Code é ajustado para modelos Claude). O OmniRoute ajuda quando:

- você **bate o limite de uso do Pro** e quer continuar trabalhando com outros modelos;
- quer **experimentar** outros modelos (Gemini, GLM, Kimi, Llama…) na interface do Claude Code;
- vai construir apps/scripts que chamam APIs de IA e quer uma URL única com fallback.

Importante: quando o Claude Code passa pelo OmniRoute, ele **não usa o seu plano Pro** — usa os
provedores configurados no OmniRoute. Outros modelos costumam ser mais fracos com as ferramentas
do Claude Code (editar arquivos, rodar comandos). Espere mais erros.

### Rotina no dia a dia

1. **Normal:** abra o terminal no projeto e rode `claude`. Plano Pro, sem OmniRoute.
2. **Limite do Pro atingido (ou quer testar outro modelo):**
   - janela 1: `omniroute serve` (deixe aberta);
   - janela 2, no projeto: `omniroute launch` (com a chave salva no passo 6 da seção 7;
     senão `omniroute launch --api-key oma_SUA_CHAVE`).
3. **Terminou:** feche a janela 2 e pare o servidor com `Ctrl+C` na janela 1 (ou `omniroute stop`).
   O próximo `claude` volta a usar o Pro.

### Como não ter a conta suspensa

Não existe truque que garanta isso, e eu não vou ajudar a disfarçar o uso. Os recursos de
"stealth" do OmniRoute existem justamente para esconder que não é o cliente oficial, e é isso
que leva a banimentos quando detectado. O caminho que **não viola** os termos:

1. **Não conecte sua conta Claude Pro no OmniRoute** (o provedor de "assinatura"/login do
   Claude). Use o Pro só pelo Claude Code oficial, direto. A Anthropic já agiu contra ferramentas
   de terceiros que reaproveitavam logins de assinatura. A conta que você mais perderia é essa.
2. **Use apenas acessos oficiais via chave de API**, inclusive os gratuitos (ex.: Google AI
   Studio/Gemini API, Groq, OpenRouter com modelos `:free`, Mistral). Tiers grátis de API são
   oferecidos pelo próprio provedor, então usá-los está dentro das regras, respeitando os limites.
3. **Evite** os provedores que reaproveitam login de sites (ChatGPT web, Gemini/Antigravity,
   Kiro etc.) e os marcados como "avoid" no catálogo de risco do próprio OmniRoute.
4. **Não crie várias contas** para somar cotas grátis: quase todos os termos proíbem isso.

### E se eu não tiver nenhuma chave de API nem conta em outras IAs?

- **Funciona mesmo assim:** o OmniRoute vem com o provedor **OpenCode Free** (sem login) já
  ligado ao modelo `auto`, então ele responde logo após instalar.
- **O que você perde:** qualidade e estabilidade. Os modelos grátis mudam e podem sumir sem
  aviso, os limites são desconhecidos e o desempenho no Claude Code é bem pior que o do Claude.
- **Privacidade:** sem chave, seus prompts e seu código vão para um serviço de terceiros, sem
  contrato com você. Não envie nada privado (senhas, `.env`, código de cliente).
- **Recomendação:** criar uma conta gratuita no Google AI Studio, no Groq ou no OpenRouter leva
  poucos minutos, normalmente sem cartão, e dá uma chave de API oficial. É mais estável e está
  dentro dos termos.

## 10. Ter as skills em todos os projetos

O Claude Code procura skills em dois lugares: `.claude/skills/` **do projeto** e
`~/.claude/skills/` **do usuário** (vale para todos os projetos). O mesmo vale para o
`CLAUDE.md`: `~/.claude/CLAUDE.md` é lido em toda sessão, em qualquer pasta.

No seu computador, dentro da pasta do `my-portfolio` (depois do merge do PR, ou no branch dele):

```powershell
New-Item -ItemType Directory -Force "$HOME\.claude\skills" | Out-Null
Copy-Item -Recurse -Force .\.claude\skills\* "$HOME\.claude\skills\"
Copy-Item .\docs\claude-global\CLAUDE.md "$HOME\.claude\CLAUDE.md"   # cuidado: substitui o seu, se já existir
```

- `docs/claude-global/CLAUDE.md` é a versão **geral** das regras (português, explicação
  detalhada, `review-loop`, segurança com terceiros), sem as partes específicas do portfólio.
- Se você já tem um `~/.claude/CLAUDE.md`, copie o conteúdo para dentro dele em vez de substituir.
- A `ponytail` fica ativa em **todo** trabalho de código. Se não quiser isso em todo lugar, apague
  `~/.claude/skills/ponytail` e mantenha só nos projetos onde quiser.
- Depois de copiar para o global, as cópias dentro de `my-portfolio/.claude/skills/` são
  redundantes, mas não atrapalham.
