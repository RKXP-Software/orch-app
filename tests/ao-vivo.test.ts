import { describe, expect, it } from 'vitest'
import { tarefasAoVivo } from '@shared/ao-vivo'
import type { EntradaLog } from '@shared/tipos'

const sub = (fase: 'inicio' | 'fim', id: string, descricao: string, agente = 'orch:desenvolvedor'): EntradaLog => ({
  tipo: 'subagente', quando: '', fase, id, descricao, agente
})

describe('tarefasAoVivo', () => {
  it('mostra só as tarefas com subagente ainda rodando', () => {
    const vivo = tarefasAoVivo([
      sub('inicio', 'a', 'T1 Mapear auth', 'orch:pesquisador'),
      sub('inicio', 'b', 'T2 Levantar rotas', 'orch:pesquisador'),
      sub('fim', 'a', 'resumo de T1'),
      sub('inicio', 'c', 't3 implementar middleware')
    ])
    expect([...vivo.entries()]).toEqual([
      ['T2', 'orch:pesquisador'],
      ['T3', 'orch:desenvolvedor']
    ])
  })

  it('ignora subagentes que não são tarefas de plano', () => {
    expect(tarefasAoVivo([sub('inicio', 'x', 'Explorar o código')]).size).toBe(0)
  })
})
