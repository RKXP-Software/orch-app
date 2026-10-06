import { describe, expect, it } from 'vitest'
import { colunaDoCartao, lerQuadro, marcaCartao, novoCartao, planosDoCartao, promptDoCartao } from '@shared/quadro'
import type { Plano, StatusPlano, StatusTarefa } from '@shared/tipos'

function plano(id: string, status: StatusPlano, demanda: string, tarefas: StatusTarefa[] = ['pendente']): Plano {
  return {
    id, titulo: id, status, demanda, objetivo: null, grupo: null, dependeDosPlanos: [], criado: null, atualizado: null,
    commitInicial: null, versaoOrch: null, ondas: [], eventos: [], resultadoFinal: null, origem: 'json', arquivoMd: null,
    tarefas: tarefas.map((s, i) => ({
      id: `T${i + 1}`, titulo: '', executor: '', dependeDe: [], arquivos: [], prontoQuando: null, status: s,
      inicio: null, fim: null, tentativas: 0, resultado: null
    }))
  }
}

describe('quadro', () => {
  const c = novoCartao('Login com JWT', 'Proteger a API com JWT e testes.')

  it('prompt leva título, descrição e a marca do cartão', () => {
    expect(promptDoCartao(c, false)).toBe(`/orch:orquestrar --plano Login com JWT\n\nProteger a API com JWT e testes.\n\n${marcaCartao(c.id)}`)
    expect(promptDoCartao(c, true).startsWith('/orch:orquestrar Login')).toBe(true)
  })

  it('acha o plano pela marca na demanda', () => {
    const p = plano('p1', 'planejado', `Login com JWT ... ${marcaCartao(c.id)}`)
    expect(planosDoCartao(c, [p, plano('p2', 'planejado', 'outra coisa')]).map((x) => x.id)).toEqual(['p1'])
  })

  it('a coluna segue o plano', () => {
    const m = marcaCartao(c.id)
    expect(colunaDoCartao(c, [])).toBe('ideias')
    expect(colunaDoCartao({ ...c, coluna: 'planejando' }, [])).toBe('planejando')
    expect(colunaDoCartao(c, [plano('p', 'planejado', m)])).toBe('planejado')
    expect(colunaDoCartao(c, [plano('p', 'em-execucao', m)])).toBe('executando')
    expect(colunaDoCartao(c, [plano('p', 'parcial', m)])).toBe('executando')
    expect(colunaDoCartao(c, [plano('p', 'concluido', m)])).toBe('concluido')
    expect(colunaDoCartao(c, [plano('a', 'concluido', m), plano('b', 'planejado', m, ['concluida', 'pendente'])])).toBe('executando')
  })

  it('cartão fixado ignora o plano', () => {
    expect(colunaDoCartao({ ...c, coluna: 'concluido', fixado: true }, [plano('p', 'planejado', marcaCartao(c.id))])).toBe('concluido')
  })

  it('lê quadro com dados faltando ou inválidos', () => {
    const q = lerQuadro({ cartoes: [{ id: 'x', titulo: 'a', coluna: 'invalida' }, null, { semId: true }] })
    expect(q.cartoes).toHaveLength(1)
    expect(q.cartoes[0]).toMatchObject({ id: 'x', coluna: 'ideias', fixado: false, planos: [] })
    expect(lerQuadro(undefined).cartoes).toEqual([])
  })
})
