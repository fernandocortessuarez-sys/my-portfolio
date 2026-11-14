# Hook "continue-until-done": o agente não para com tarefas pendentes

## O problema que isto resolve

O Claude Code só continua trabalhando enquanto o modelo chama ferramentas. Quando o modelo
responde só com texto ("Vou continuar depois", "Qual abordagem você prefere?"), o turno
**termina**. Isso não é um limite de tempo, nem um defeito do OmniRoute: é o modelo decidindo
parar. Modelos mais fracos e skills como `superpowers:brainstorming` (que termina perguntando
ao usuário) fazem isso com frequência.

Este hook intercepta o momento em que o agente tenta parar. Se o arquivo de checklist ainda
tem tarefas `- [ ]`, ele devolve ao agente a instrução de continuar.

**O que ele garante e o que não garante:**
- Garante: quem decide *parar* é um script que lê um arquivo, não o humor do modelo.
- Não garante: que o modelo trabalhe bem. Um modelo fraco ainda pode ignorar a instrução ou
  marcar `[x]` sem ter feito. E o hook **não faz nada se não existir checklist**. Por isso o
  `CLAUDE.md` global manda o agente criar `.claude/CHECKLIST.md` (passo 1 abaixo).

## Arquivos

| Arquivo | Função |
|---|---|
| `continue-until-done.mjs` | O hook em si (Node.js, sem dependências, sem rede). |
| `install.mjs` | Instala/remove o hook no seu `settings.json`, com backup. |
| `README.md` | Este guia. |

## Como funciona

1. O agente tenta encerrar o turno. O Claude Code roda o hook e entrega um JSON por stdin.
2. O hook procura o checklist, nesta ordem: variável `CLAUDE_CHECKLIST_FILE`; depois
   `.claude/CHECKLIST.md` do projeto; depois o `.md` mais recente de `docs/superpowers/plans/`
   (onde a skill `writing-plans` salva os planos, com caixas `- [ ]`).
3. Ignora o arquivo se: não existe, é link simbólico, ou não foi alterado nas últimas 24 h
   (um plano velho com sobras não deve travar uma sessão de outro assunto).
4. Conta só as tarefas `- [ ]` fora de blocos de código (``` ou ~~~) e aceita arquivos com
   BOM e finais de linha do Windows.
5. Sem pendências: deixa parar. Com pendências: imprime `{"decision":"block","reason":"..."}`
   e o Claude Code entrega ao agente: quantas faltam, as 5 próximas e "continue".
6. O agente trabalha, marca `[x]`, tenta parar de novo. Repete até zerar.

## Quando ele solta o agente (proteção contra gastar tokens à toa)

| Situação | O que acontece |
|---|---|
| Todas as tarefas `[x]` | Para normalmente. |
| Agente bloqueado de verdade (senha, decisão sua, ação de risco) | Cria `.claude/STOP_OK` com o motivo; o hook deixa parar e apaga o arquivo. |
| 5 paradas seguidas sem nenhuma tarefa nova concluída | Libera. `CLAUDE_CONTINUE_STALL` muda o número. |
| 40 continuações numa mesma mensagem sua | Libera. `CLAUDE_CONTINUE_MAX` muda o número. |
| Você digita uma mensagem nova | Os contadores recomeçam. |
| Não consegue gravar o contador, erro interno, entrada estranha | Libera. O hook falha sempre "aberto". |

A documentação do Claude Code também cita um limite próprio para bloqueios seguidos
(https://code.claude.com/docs/en/hooks); não dependo dele: os limites acima são os que valem.

## Instalar (Windows, passo a passo)

Você precisa do **Node.js 18 ou mais novo** (`node --version`; se der erro, instale em nodejs.org,
o mesmo que você já usa para o OmniRoute).

**1) Regras globais** (é o que faz o agente criar o checklist e não parar à toa). No PowerShell,
dentro da pasta do projeto `my-portfolio`:

```powershell
git pull
Copy-Item .\docs\claude-global\CLAUDE.md "$HOME\.claude\CLAUDE.md"
```

Atenção: isso **substitui** um `CLAUDE.md` global que você já tenha. Se tiver um, abra os dois
arquivos e junte o conteúdo à mão em vez de copiar.

**2) O hook:**

```powershell
node docs\claude-global\continue-hook\install.mjs
```

Saída esperada: `Backup: ...settings.json.bak-...` (só se você já tinha um settings.json),
`Hook instalado: ...` e `Registrado em: ...`. O instalador copia o script para
`%USERPROFILE%\.claude\hooks\`, guarda o backup e adiciona **uma** entrada em `hooks.Stop`
sem tocar no resto. Se o `settings.json` for inválido, ele aborta sem escrever nada.

**3) Reinicie o Claude Code** (feche e abra de novo) e digite `/hooks`: deve listar um hook
`Stop` com `node`.

**Como saber que está funcionando:** o agente tenta parar com tarefas pendentes e continua; no
histórico aparece o texto "Ainda há N tarefa(s) pendente(s)...".

**Para desligar:** `node docs\claude-global\continue-hook\install.mjs --uninstall`. É global
(vale para todos os projetos). Para pausar só em um projeto, marque todas as caixas do checklist
dele ou apague `.claude\CHECKLIST.md`. Se você usa o Claude Code dentro do WSL, ele tem outra
pasta pessoal: rode o instalador de dentro do WSL.

## Como usar

- Com a skill `writing-plans`: o plano já nasce com `- [ ]`. Aprove e mande executar.
- Sem ela: peça ao agente "crie `.claude/CHECKLIST.md` com todas as etapas como `- [ ]`, termine
  pela etapa 'rodar review-loop e testes' e execute tudo". As regras globais já mandam isso.

## Segurança

- O script só **lê** o checklist, **escreve** um contador minúsculo na pasta temporária
  (`claude-continue-hook`) e **apaga** o `STOP_OK`. Sem rede, não executa comandos.
- O texto das tarefas vai ao agente truncado (140 caracteres), sem caracteres de controle e
  **marcado como dado, não como ordem do usuário**. Mesmo assim, um repositório que você não
  conhece pode trazer um checklist com tarefas maliciosas. O risco é parecido com o do
  `CLAUDE.md` do próprio repositório, que o Claude Code também lê. Em repositório desconhecido,
  desinstale o hook ou não aprove planos que você não leu.
- Testado só com simulação do JSON de entrada (Node 22, Linux), incluindo BOM, CRLF, blocos de
  código, link simbólico, plano antigo, contador que não grava e entrada que nunca fecha. **Não
  testei dentro do Claude Code no Windows.** A forma `command` + `args` e o formato do `Stop`
  seguem a documentação oficial.

## Alternativa sem instalar nada: `/goal`

`/goal <condição>` (ex.: `/goal todas as tarefas do plano marcadas [x], ou pare após 20 turnos`)
mantém o Claude Code trabalhando até a condição ser cumprida. Quem avalia é o "modelo pequeno e
rápido" configurado; atrás de um gateway como o OmniRoute isso depende de como o modelo Haiku
está mapeado, e por isso este hook, que só lê um arquivo, é mais previsível. `/goal clear` cancela.
(Fonte: https://code.claude.com/docs/en/goal.md)
