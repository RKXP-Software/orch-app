# Orch app — desenvolvimento

App Electron + React + TypeScript que executa o plugin orch pelo Claude Agent SDK. Visão geral no [README.md](README.md).

- Código, comentários e UI em pt-BR, nomes em português (`sessao`, `plano`, `tarefa`), como no plugin.
- `src/shared/` não pode importar Electron nem Node: é usado também pela interface.
- O SDK e o chokidar são ESM-only e o processo principal é CJS: importe-os com `await import(...)` e use `import type` para os tipos.
- No modo manual por ondas o app é o único a gravar o estado das tarefas no `.json` (`src/main/planos.ts`, `alterarTarefa`); as sessões de tarefa não tocam no plano. A lógica pura fica em `src/shared/execucao.ts`; a fila e o ciclo de vida das tarefas em `src/main/tarefas.ts`.
- O formato `.claude/orch/planos/<id>.json` é contrato com o plugin (repositório RKXP-Software/orch, `plugin/templates/plano.json`). Mudou o formato? Mude os dois lados e o `schema`.
- Antes de concluir uma mudança: `npm run typecheck`, `npm test` e `npx electron-vite build`.
