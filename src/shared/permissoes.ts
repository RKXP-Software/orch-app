// Modos de permissão do app e a regra de quais pedidos são aprovados sem perguntar.

import type { ModoPermissao } from './tipos'

export interface InfoModo {
  id: ModoPermissao
  nome: string
  ajuda: string
}

export const MODOS: InfoModo[] = [
  {
    id: 'default',
    nome: 'Perguntar sempre',
    ajuda: 'Cada ação que precisa de permissão aparece para você aprovar.'
  },
  {
    id: 'acceptEdits',
    nome: 'Aceitar edições',
    ajuda: 'Edições de arquivo são aprovadas sozinhas; comandos e outras ações ainda perguntam.'
  },
  {
    id: 'auto',
    nome: 'Automático',
    ajuda: 'Um classificador aprova ou nega cada ação; só o que ele não decidir chega a você.'
  },
  {
    id: 'livre',
    nome: 'Sem confirmações (bypass)',
    ajuda:
      'Tudo é aprovado sozinho. Você só responde perguntas de planejamento e a aprovação de planos. Regras de bloqueio das suas configurações continuam valendo.'
  },
  {
    id: 'plan',
    nome: 'Somente leitura',
    ajuda: 'Modo plano: o Claude pesquisa e planeja, mas não altera nada até você aprovar o plano.'
  }
]

export const infoModo = (m: ModoPermissao): InfoModo => MODOS.find((x) => x.id === m) ?? MODOS[0]

/** Ferramentas que são decisões do usuário, não permissões: nunca aprovadas sozinhas. */
export const FERRAMENTAS_DE_PLANEJAMENTO = new Set(['AskUserQuestion', 'ExitPlanMode'])

const FERRAMENTAS_DE_EDICAO = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/**
 * Modo enviado ao Claude Code. "livre" é aplicado pelo app (aprovação no canUseTool), e não pelo
 * bypassPermissions do SDK, para garantir que perguntas e aprovação de plano continuem chegando aqui.
 */
export function modoDoSdk(m: ModoPermissao): 'default' | 'acceptEdits' | 'auto' | 'plan' {
  return m === 'livre' ? 'acceptEdits' : m
}

/** O pedido de permissão desta ferramenta pode ser aprovado sem perguntar, neste modo? */
export function aprovaSozinho(modo: ModoPermissao, ferramenta: string): boolean {
  if (FERRAMENTAS_DE_PLANEJAMENTO.has(ferramenta)) return false
  if (modo === 'livre') return true
  if (modo === 'acceptEdits') return FERRAMENTAS_DE_EDICAO.has(ferramenta)
  return false
}
