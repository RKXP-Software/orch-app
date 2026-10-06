// Quadro kanban de demandas: cada cartão descreve o que deve virar um plano do orch.
// Gravado no projeto em .claude/orch/quadro.json, ao lado dos planos.

import { progresso } from './plano'
import type { Plano } from './tipos'

export type ColunaQuadro = 'ideias' | 'planejando' | 'planejado' | 'executando' | 'concluido'

export const COLUNAS: { id: ColunaQuadro; nome: string; ajuda: string }[] = [
  { id: 'ideias', nome: 'Ideias', ajuda: 'Demandas descritas, ainda sem plano.' },
  { id: 'planejando', nome: 'Planejando', ajuda: 'O orquestrador está montando o plano.' },
  { id: 'planejado', nome: 'Planejado', ajuda: 'Plano pronto, esperando execução.' },
  { id: 'executando', nome: 'Em execução', ajuda: 'Tarefas do plano em andamento.' },
  { id: 'concluido', nome: 'Concluído', ajuda: 'Plano entregue.' }
]

export interface Cartao {
  id: string
  titulo: string
  /** O que deve virar um plano: objetivo, contexto, critérios de pronto. */
  descricao: string
  coluna: ColunaQuadro
  /** true quando o usuário arrastou o cartão: a coluna não segue mais o plano. */
  fixado: boolean
  /** Planos gerados a partir do cartão. */
  planos: string[]
  criado: string
  atualizado: string
}

export interface Quadro {
  schema: 'orch.quadro/1'
  cartoes: Cartao[]
}

export const quadroVazio = (): Quadro => ({ schema: 'orch.quadro/1', cartoes: [] })

export function lerQuadro(bruto: unknown): Quadro {
  const o = (bruto ?? {}) as Partial<Quadro>
  const colunas = new Set(COLUNAS.map((c) => c.id))
  const cartoes = (Array.isArray(o.cartoes) ? o.cartoes : [])
    .filter((c): c is Cartao => !!c && typeof c.id === 'string')
    .map((c) => ({
      id: c.id,
      titulo: String(c.titulo ?? ''),
      descricao: String(c.descricao ?? ''),
      coluna: colunas.has(c.coluna) ? c.coluna : 'ideias',
      fixado: c.fixado === true,
      planos: Array.isArray(c.planos) ? c.planos.filter((p) => typeof p === 'string') : [],
      criado: String(c.criado ?? ''),
      atualizado: String(c.atualizado ?? '')
    }))
  return { schema: 'orch.quadro/1', cartoes }
}

/** Marca colocada no fim do prompt; o orch grava a demanda literal no plano, e é assim que o plano volta ao cartão. */
export const marcaCartao = (id: string) => `[quadro:${id}]`

/** Planos do cartão: os já registrados e os que trazem a marca do cartão na demanda. */
export function planosDoCartao(c: Cartao, planos: Plano[]): Plano[] {
  const marca = marcaCartao(c.id)
  return planos.filter((p) => c.planos.includes(p.id) || p.demanda.includes(marca))
}

/** Coluna em que o cartão aparece: a do plano, a não ser que o usuário tenha fixado outra. */
export function colunaDoCartao(c: Cartao, planos: Plano[]): ColunaQuadro {
  if (c.fixado) return c.coluna
  const ps = planosDoCartao(c, planos).filter((p) => p.status !== 'cancelado')
  if (ps.length === 0) return c.coluna === 'planejando' ? 'planejando' : c.coluna === 'concluido' ? 'concluido' : 'ideias'
  if (ps.every((p) => p.status === 'concluido')) return 'concluido'
  if (ps.some((p) => p.status === 'em-execucao' || p.status === 'parcial')) return 'executando'
  if (ps.some((p) => progresso(p).feitas > 0)) return 'executando'
  return 'planejado'
}

/** Prompt para o orquestrador: título e descrição do cartão, com a marca para o vínculo. */
export function promptDoCartao(c: Cartao, executar: boolean): string {
  const modo = executar ? '' : '--plano '
  const corpo = [c.titulo.trim(), c.descricao.trim()].filter(Boolean).join('\n\n')
  return `/orch:orquestrar ${modo}${corpo}\n\n${marcaCartao(c.id)}`
}

export function novoCartao(titulo: string, descricao: string): Cartao {
  const agora = new Date().toISOString()
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return { id, titulo, descricao, coluna: 'ideias', fixado: false, planos: [], criado: agora, atualizado: agora }
}
