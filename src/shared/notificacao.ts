import { nomePasta } from './caminhos'
import type { Pendencia, Sessao } from './tipos'

/** Título e texto da notificação do Windows para uma pendência. */
export function textoDaPendencia(sessao: Sessao, p: Pendencia): { titulo: string; corpo: string } {
  const projeto = nomePasta(sessao.projeto)
  if (p.tipo === 'pergunta') {
    const q = p.perguntas[0]?.question ?? 'O Claude tem uma pergunta.'
    return { titulo: `Pergunta em ${projeto}`, corpo: `${sessao.titulo}\n${q}` }
  }
  if (p.ferramenta === 'ExitPlanMode') {
    return { titulo: `Plano para aprovar em ${projeto}`, corpo: sessao.titulo }
  }
  const detalhe = p.detalhe.split('\n')[0].slice(0, 120)
  return { titulo: `Aprovação pendente em ${projeto}`, corpo: `${p.titulo}\n${detalhe}` }
}
