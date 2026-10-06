import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ExecutorTarefas } from '../src/main/tarefas'
import type { Configuracao, ItemFila, NovaSessao, Sessao } from '@shared/tipos'

const OPCOES = { isolamento: 'mesma-pasta', mergeWorktree: 'manual' } as const

function tarefa(id: string, dependeDe: string[] = []) {
  return {
    id, titulo: `Tarefa ${id}`, executor: 'orch:desenvolvedor', dependeDe, arquivos: [], prontoQuando: null,
    status: 'pendente', inicio: null, fim: null, tentativas: 0, resultado: null
  }
}

describe('ExecutorTarefas', () => {
  let projeto: string
  let iniciadas: NovaSessao[]
  let sessoesVivas: Sessao[]
  let filas: ItemFila[][]
  let maxParalelo: number
  let exec: ExecutorTarefas

  const lerPlano = () => JSON.parse(readFileSync(join(projeto, '.claude', 'orch', 'planos', 'p1.json'), 'utf8'))
  const status = (id: string) => lerPlano().tarefas.find((t: { id: string }) => t.id === id).status
  const fimDe = (i: number, sucesso: boolean, texto = 'RESULTADO: feito') =>
    exec.aoTerminar(sessoesVivas[i], { sucesso, texto, encerrada: !sucesso })
  const esperar = () => new Promise((r) => setTimeout(r, 30))

  beforeEach(() => {
    projeto = mkdtempSync(join(tmpdir(), 'orch-tarefas-'))
    mkdirSync(join(projeto, '.claude', 'orch', 'planos'), { recursive: true })
    writeFileSync(
      join(projeto, '.claude', 'orch', 'planos', 'p1.json'),
      JSON.stringify({
        schema: 'orch.plano/1', id: 'p1', titulo: 'P1', status: 'planejado', demanda: 'd',
        tarefas: [tarefa('T1'), tarefa('T2'), tarefa('T3'), tarefa('T4', ['T1'])], eventos: []
      })
    )
    iniciadas = []
    sessoesVivas = []
    filas = []
    maxParalelo = 2
    const sessoes = {
      iniciar: async (n: NovaSessao) => {
        iniciadas.push(n)
        const s = { id: `s${iniciadas.length}`, projeto: n.projeto, plano: n.plano, tarefa: n.tarefa } as Sessao
        sessoesVivas.push(s)
        return s
      },
      listar: () => sessoesVivas,
      encerrar: () => undefined
    }
    exec = new ExecutorTarefas(sessoes, () => ({ maxParalelo, modeloPadrao: '' }) as Configuracao, (f) => filas.push(f))
  })

  afterEach(() => rmSync(projeto, { recursive: true, force: true }))

  it('inicia só até o limite e enfileira o resto, em ordem', async () => {
    await exec.executar(projeto, 'p1', [{ tarefa: 'T1', modelo: 'opus' }, { tarefa: 'T2', modelo: 'sonnet' }, { tarefa: 'T3', modelo: '' }], OPCOES)
    await esperar()
    expect(iniciadas.map((n) => n.tarefa)).toEqual(['T1', 'T2'])
    expect(iniciadas.map((n) => n.modelo)).toEqual(['opus', 'sonnet'])
    expect(iniciadas[0].prompt).toContain('--tarefa p1 T1')
    expect(exec.listarFila().map((i) => i.tarefa)).toEqual(['T3'])
    expect(status('T1')).toBe('em-andamento')
    expect(status('T3')).toBe('pendente')
    expect(lerPlano().status).toBe('em-execucao')
  })

  it('ao terminar uma tarefa, a próxima da fila começa e o resultado é gravado', async () => {
    await exec.executar(projeto, 'p1', [{ tarefa: 'T1', modelo: '' }, { tarefa: 'T2', modelo: '' }, { tarefa: 'T3', modelo: '' }], OPCOES)
    await esperar()
    fimDe(0, true, 'Texto\nRESULTADO: login pronto')
    await esperar()
    expect(status('T1')).toBe('concluida')
    expect(lerPlano().tarefas[0].resultado).toBe('login pronto')
    expect(iniciadas.map((n) => n.tarefa)).toEqual(['T1', 'T2', 'T3'])
    expect(exec.listarFila()).toEqual([])
  })

  it('falha marca a tarefa e libera a vaga; dá para tentar de novo', async () => {
    await exec.executar(projeto, 'p1', [{ tarefa: 'T1', modelo: '' }], OPCOES)
    await esperar()
    fimDe(0, false, 'quebrou tudo')
    await esperar()
    expect(status('T1')).toBe('falhou')
    expect(lerPlano().status).toBe('parcial')
    await exec.executar(projeto, 'p1', [{ tarefa: 'T1', modelo: '' }], OPCOES)
    await esperar()
    expect(lerPlano().tarefas[0].tentativas).toBe(2)
    expect(lerPlano().eventos.map((e: { tipo: string }) => e.tipo)).toContain('tarefa-reenviada')
  })

  it('recusa tarefa sem dependências concluídas ou já na fila', async () => {
    await expect(exec.executar(projeto, 'p1', [{ tarefa: 'T4', modelo: '' }], OPCOES)).rejects.toThrow(/dependências/)
    maxParalelo = 1
    await exec.executar(projeto, 'p1', [{ tarefa: 'T1', modelo: '' }, { tarefa: 'T2', modelo: '' }], OPCOES)
    await expect(exec.executar(projeto, 'p1', [{ tarefa: 'T2', modelo: '' }], OPCOES)).rejects.toThrow(/já está/)
  })

  it('cancelar na fila tira a tarefa sem tocar no plano', async () => {
    maxParalelo = 1
    await exec.executar(projeto, 'p1', [{ tarefa: 'T1', modelo: '' }, { tarefa: 'T2', modelo: '' }], OPCOES)
    await esperar()
    exec.cancelarNaFila(projeto, 'p1', 'T2')
    expect(exec.listarFila()).toEqual([])
    expect(status('T2')).toBe('pendente')
  })

  it('aumentar o limite e chamar bombear dispara a fila', async () => {
    maxParalelo = 1
    await exec.executar(projeto, 'p1', [{ tarefa: 'T1', modelo: '' }, { tarefa: 'T2', modelo: '' }], OPCOES)
    await esperar()
    expect(iniciadas).toHaveLength(1)
    maxParalelo = 3
    exec.bombear()
    await esperar()
    expect(iniciadas).toHaveLength(2)
  })

  it('recupera tarefas do app sem sessão viva, e não toca nas do plugin', async () => {
    const caminho = join(projeto, '.claude', 'orch', 'planos', 'p1.json')
    const plano = lerPlano()
    plano.tarefas[0].status = 'em-andamento'
    plano.tarefas[0].sessaoApp = 'morta'
    plano.tarefas[1].status = 'em-andamento'
    writeFileSync(caminho, JSON.stringify(plano))
    exec.recuperarOrfas(projeto)
    expect(status('T1')).toBe('pendente')
    expect(status('T2')).toBe('em-andamento')
  })

  it('pular marca a tarefa e libera as dependentes', () => {
    exec.pular(projeto, 'p1', 'T1')
    expect(status('T1')).toBe('pulada')
  })
})
