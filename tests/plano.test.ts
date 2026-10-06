import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { calcularOndas, planoDoJson, planoDoMd, progresso, tarefasProntas } from '@shared/plano'

const fixture = (nome: string) => readFileSync(join(__dirname, 'fixtures', nome), 'utf8')

describe('planoDoJson', () => {
  const plano = planoDoJson(JSON.parse(fixture('20261005-0900-perfil.json')))

  it('lê os campos e normaliza status', () => {
    expect(plano.id).toBe('20261005-0900-perfil')
    expect(plano.status).toBe('em-execucao')
    expect(plano.tarefas.map((t) => t.status)).toEqual(['concluida', 'pendente', 'pendente'])
    expect(plano.origem).toBe('json')
  })

  it('calcula ondas quando o JSON não traz', () => {
    expect(plano.ondas).toEqual([['T1'], ['T2'], ['T3']])
  })

  it('identifica tarefas prontas', () => {
    expect(tarefasProntas(plano)).toEqual(['T2'])
  })

  it('rejeita schema desconhecido e JSON sem id', () => {
    expect(() => planoDoJson({ schema: 'outro/1', id: 'x' })).toThrow()
    expect(() => planoDoJson({ schema: 'orch.plano/1' })).toThrow()
  })
})

describe('planoDoMd', () => {
  const plano = planoDoMd(fixture('20261004-1530-login-jwt.md'), 'C:/p/.claude/orch/planos/20261004-1530-login-jwt.md')

  it('lê cabeçalho, título e demanda', () => {
    expect(plano.id).toBe('20261004-1530-login-jwt')
    expect(plano.status).toBe('em-execucao')
    expect(plano.titulo).toBe('Login com JWT')
    expect(plano.demanda).toMatch(/JWT/)
    expect(plano.commitInicial).toBe('abc1234')
    expect(plano.origem).toBe('md')
  })

  it('lê a tabela de tarefas', () => {
    expect(plano.tarefas).toHaveLength(4)
    const [t1, , t3] = plano.tarefas
    expect(t1.status).toBe('concluida') // "concluída" com acento
    expect(t1.executor).toBe('orch:pesquisador')
    expect(t1.arquivos).toEqual([])
    expect(t1.resultado).toMatch(/Express/)
    expect(t3.dependeDe).toEqual(['T1', 'T2'])
    expect(t3.arquivos).toEqual(['src/auth.ts', 'src/app.ts'])
    expect(t3.resultado).toBeNull() // placeholder do template
  })

  it('lê registro de execução e ignora resultado final não preenchido', () => {
    expect(plano.eventos).toHaveLength(2)
    expect(plano.eventos[1].tarefa).toBe('T1')
    expect(plano.resultadoFinal).toBeNull()
  })

  it('calcula ondas e progresso', () => {
    expect(plano.ondas).toEqual([['T1', 'T2'], ['T3'], ['T4']])
    expect(progresso(plano)).toEqual({ feitas: 2, total: 4, pct: 50 })
  })
})

describe('calcularOndas', () => {
  it('não trava com ciclo', () => {
    expect(() => calcularOndas([{ id: 'A', dependeDe: ['B'] }, { id: 'B', dependeDe: ['A'] }])).not.toThrow()
  })
})
