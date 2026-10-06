import { describe, expect, it } from 'vitest'
import {
  conflitosDeArquivos,
  FilaTarefas,
  limitarParalelo,
  motivoIndisponivel,
  normalizarConfigExecucao,
  promptPlano,
  promptTarefa,
  resumoDoResultado,
  statusDerivado,
  tarefasSelecionaveis
} from '@shared/execucao'
import type { StatusTarefa, Tarefa } from '@shared/tipos'

function t(id: string, status: StatusTarefa, dependeDe: string[] = [], arquivos: string[] = []): Tarefa {
  return {
    id, titulo: id, executor: 'orch:desenvolvedor', dependeDe, arquivos, prontoQuando: null, status,
    inicio: null, fim: null, tentativas: 0, resultado: null, modelo: null, sessaoApp: null, pasta: null, merge: null
  }
}

describe('seleção de tarefas', () => {
  const plano = { tarefas: [t('T1', 'concluida'), t('T2', 'pendente', ['T1']), t('T3', 'falhou', ['T1']), t('T4', 'pendente', ['T2']), t('T5', 'em-andamento')] }

  it('libera pendentes e falhas com dependências concluídas', () => {
    expect(tarefasSelecionaveis(plano)).toEqual(['T2', 'T3'])
  })

  it('tarefa pulada satisfaz a dependência', () => {
    expect(tarefasSelecionaveis({ tarefas: [t('T1', 'pulada'), t('T2', 'pendente', ['T1'])] })).toEqual(['T2'])
  })

  it('explica por que não dá para marcar', () => {
    expect(motivoIndisponivel(plano, plano.tarefas[3])).toBe('Depende de T2')
    expect(motivoIndisponivel(plano, plano.tarefas[0])).toBe('Já concluída')
    expect(motivoIndisponivel(plano, plano.tarefas[1])).toBeNull()
  })
})

describe('conflitos de arquivos', () => {
  const plano = { tarefas: [t('T1', 'pendente', [], ['src/a.ts']), t('T2', 'pendente', [], ['src/']), t('T3', 'pendente', [], ['docs/x.md'])] }

  it('detecta caminho igual ou dentro de pasta', () => {
    expect(conflitosDeArquivos(plano, ['T1', 'T2', 'T3'])).toEqual([['T1', 'T2']])
  })

  it('só considera as marcadas', () => {
    expect(conflitosDeArquivos(plano, ['T1', 'T3'])).toEqual([])
  })
})

describe('status do plano', () => {
  it('em execução enquanto houver tarefa em andamento', () => {
    expect(statusDerivado([{ status: 'concluida' }, { status: 'em-andamento' }], 'planejado')).toBe('em-execucao')
  })
  it('concluído quando tudo terminou (puladas contam)', () => {
    expect(statusDerivado([{ status: 'concluida' }, { status: 'pulada' }], 'em-execucao')).toBe('concluido')
  })
  it('parcial com falha e nada rodando', () => {
    expect(statusDerivado([{ status: 'concluida' }, { status: 'falhou' }, { status: 'pendente' }], 'em-execucao')).toBe('parcial')
  })
  it('entre ondas segue em execução; sem nada feito, mantém', () => {
    expect(statusDerivado([{ status: 'concluida' }, { status: 'pendente' }], 'em-execucao')).toBe('em-execucao')
    expect(statusDerivado([{ status: 'pendente' }], 'planejado')).toBe('planejado')
  })
  it('cancelado não muda', () => {
    expect(statusDerivado([{ status: 'concluida' }], 'cancelado')).toBe('cancelado')
  })
})

describe('prompts e resultado', () => {
  it('monta os prompts', () => {
    expect(promptTarefa('p1', 'T2', null)).toBe('/orch:orquestrar --tarefa p1 T2')
    expect(promptTarefa('p1', 'T2', 'C:/p/.claude/orch/planos/p1.json')).toBe('/orch:orquestrar --tarefa p1 T2\nPlano: C:/p/.claude/orch/planos/p1.json')
    expect(promptPlano('p1', 9)).toBe('/orch:orquestrar --executar p1 --paralelo 6')
  })
  it('extrai a linha RESULTADO', () => {
    expect(resumoDoResultado('Feito.\nRESULTADO: criei o login e os testes passam.\nOutros')).toBe('criei o login e os testes passam.')
    expect(resumoDoResultado('Sem marca  aqui')).toBe('Sem marca aqui')
  })
})

describe('configuração de execução', () => {
  it('limita o paralelismo entre 1 e 6', () => {
    expect(limitarParalelo(0)).toBe(1)
    expect(limitarParalelo(99)).toBe(6)
    expect(limitarParalelo(undefined)).toBe(3)
    expect(limitarParalelo(2.4)).toBe(2)
  })
  it('corrige valores inválidos', () => {
    expect(normalizarConfigExecucao({ maxParalelo: 10, isolamento: 'x' as never })).toEqual({
      maxParalelo: 6, modoExecucaoPadrao: 'automatico', isolamento: 'mesma-pasta', mergeWorktree: 'manual'
    })
  })
})

describe('fila de tarefas', () => {
  const item = (tarefa: string) => ({ projeto: 'p', plano: 'a', tarefa, modelo: '' })

  it('respeita as vagas e a ordem de chegada', () => {
    const f = new FilaTarefas()
    ;['T1', 'T2', 'T3'].forEach((x) => f.adicionar(item(x)))
    expect(f.retirar(1, 2).map((i) => i.tarefa)).toEqual(['T1'])
    expect(f.retirar(2, 2)).toEqual([])
    expect(f.retirar(0, 6).map((i) => i.tarefa)).toEqual(['T2', 'T3'])
  })

  it('não duplica e permite cancelar', () => {
    const f = new FilaTarefas()
    expect(f.adicionar(item('T1'))).toBe(true)
    expect(f.adicionar(item('T1'))).toBe(false)
    expect(f.remover(item('T1'))).toBe(true)
    expect(f.listar()).toEqual([])
  })
})
