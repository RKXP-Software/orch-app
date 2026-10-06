// Tarefas em andamento deduzidas dos eventos da execução, antes de o plano ser regravado.

import type { EntradaLog } from './tipos'

/** O orquestrador descreve cada delegação como "<ID> <3-5 palavras>" (ex.: "T3 Implementar login"). */
const ID_TAREFA = /^\s*\[?(T\d+)\b/i

/** id da tarefa → agente, para os subagentes que começaram e ainda não terminaram. */
export function tarefasAoVivo(log: EntradaLog[]): Map<string, string> {
  const abertos = new Map<string, { tarefa: string; agente: string }>()
  for (const e of log) {
    if (e.tipo !== 'subagente' || !e.id) continue
    if (e.fase === 'inicio') {
      const m = e.descricao.match(ID_TAREFA)
      if (m) abertos.set(e.id, { tarefa: m[1].toUpperCase(), agente: e.agente ?? 'subagente' })
    } else {
      abertos.delete(e.id)
    }
  }
  return new Map([...abertos.values()].map((x) => [x.tarefa, x.agente]))
}
