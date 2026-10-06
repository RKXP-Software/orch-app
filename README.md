# Orch — app desktop

Interface gráfica (Windows) para o plugin [orch](https://github.com/RKXP-Software/orch) do Claude Code: inicie demandas, aprove permissões, responda perguntas e acompanhe o progresso de cada plano ao vivo.

## O que faz

- **Projetos**: escolha as pastas em que o Claude vai trabalhar.
- **Nova execução**: Orquestrar, Só planejar, Especializar, Criar agente ou prompt livre, com **escolha do modelo** (lista vinda do próprio Claude Code) e do modo de permissões.
- **Rodar no app ou no CLI**: no app, a execução tem duas visões, **Conversa** e **Terminal** (estilo CLI, com a saída de cada ferramenta). **Abrir no CLI do Claude** abre o Claude Code interativo numa janela de terminal, com o mesmo prompt e modelo.
- **Permissões e perguntas** do Claude viram cartões para aprovar ou responder.
- **Planos**: lista e detalhe com tarefas organizadas em ondas, status ao vivo, registro de execução e botão Executar/Retomar.
- Tutorial na tela inicial, tema claro/escuro/sistema.

## Como funciona

O app não reimplementa o orquestrador: ele executa o Claude Code de verdade pelo [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) e lê os planos que o plugin grava no projeto.

```
Processo principal (Node)                      Interface (React)
├─ GerenciadorSessoes  → Agent SDK (query)  ──▶ execução: conversa/terminal, permissões, perguntas
├─ ObservadorPlanos    → .claude/orch/planos ──▶ planos e tarefas ao vivo
├─ terminal.ts         → abre o CLI / login
└─ armazenamento.ts    → projetos e configurações (%APPDATA%/Orch/orch-app.json)
```

- **Contrato com o plugin**: `.claude/orch/planos/<id>.json` (schema `orch.plano/1`, plugin ≥ 0.4.0). Planos de versões anteriores são lidos do `.md`, com aviso. O parser fica em [src/shared/plano.ts](src/shared/plano.ts).
- **Login**: o app usa o login do Claude Code desta máquina (`claude auth login`). Sem login, uma faixa no topo oferece o botão **Fazer login**.
- **Plugin**: por padrão, o orch instalado no Claude Code (configurações de usuário/projeto). Em **Configurações** dá para apontar uma pasta local do plugin, que é carregada com `--plugin-dir`.
- **Executável**: o binário do Claude Code que vem com o SDK. Pode ser trocado em Configurações.

## Desenvolvimento

Requisitos: Node 22+ e Windows.

```bash
npm install
```

```bash
npm run dev
```

| Script | Faz |
|---|---|
| `npm run dev` | App com hot reload |
| `npm run typecheck` | TypeScript (processo principal e interface) |
| `npm test` | Testes do parser de planos (Vitest) |
| `npm run dist` | Instalador Windows (NSIS) em `dist/` |

Se `npm run dev` falhar com "Electron uninstall", o binário do Electron não foi baixado: `node node_modules/electron/install.js`.

Ao rodar o app de dentro de uma sessão do Claude Code (terminal integrado do app desktop, por exemplo), as variáveis `CLAUDE_*` daquela sessão são herdadas pelo SDK. Para testar como um usuário final, abra o app por um terminal comum.

### Estrutura

```
src/
  shared/    tipos e leitura de planos (usados pelo main e pela interface)
  main/      processo principal: sessões (SDK), observador de planos, terminal, armazenamento
  preload/   ponte IPC segura (window.orch)
  renderer/  interface React
tests/       testes do parser + fixtures de planos (.json e .md)
```
