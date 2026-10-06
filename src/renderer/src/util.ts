import type { StatusPlano, StatusSessao, StatusTarefa } from '@shared/tipos'

type Tom = 'ok' | 'andamento' | 'erro' | 'acento' | ''

export const ROTULO_PLANO: Record<StatusPlano, [string, Tom]> = {
  planejado: ['Planejado', 'acento'],
  'em-execucao': ['Em execução', 'andamento'],
  concluido: ['Concluído', 'ok'],
  parcial: ['Parcial', 'erro'],
  cancelado: ['Cancelado', '']
}

export const ROTULO_TAREFA: Record<StatusTarefa, [string, Tom]> = {
  pendente: ['Pendente', ''],
  'em-andamento': ['Em andamento', 'andamento'],
  concluida: ['Concluída', 'ok'],
  falhou: ['Falhou', 'erro'],
  pulada: ['Pulada', '']
}

export const ROTULO_SESSAO: Record<StatusSessao, [string, Tom]> = {
  iniciando: ['Iniciando', 'andamento'],
  executando: ['Executando', 'andamento'],
  'aguardando-voce': ['Aguardando você', 'acento'],
  ociosa: ['Aguardando mensagem', ''],
  concluida: ['Concluída', 'ok'],
  erro: ['Erro', 'erro'],
  interrompida: ['Interrompida', '']
}

export function dataHora(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function hora(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function duracao(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}min ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}min`
}

export const usd = (v: number) => `US$ ${v.toFixed(2)}`

export { nomePasta } from '@shared/caminhos'

export function tokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
}
