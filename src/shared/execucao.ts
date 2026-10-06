// Regras da execução de planos pelo app: seleção de tarefas, conflitos, prompts, status do plano e fila.
// Sem Electron nem Node: também é usado pela interface.

import type { Configuracao, Isolamento, ItemFila, MergeWorktree, ModoExecucao, Plano, StatusPlano, Tarefa } from './tipos'
import { LIMITE_PARALELO } from './tipos'

/** Tarefas que o usuário pode marcar: prontas (dependências concluídas ou puladas) e as que falharam. */
export function tarefasSelecionaveis(plano: Pick<Plano, 'tarefas'>): string[] {
  const status = new Map(plano.tarefas.map((t) => [t.id, t.status]))
  const depsOk = (t: Tarefa) => t.dependeDe.every((d) => status.get(d) === 'concluida' || status.get(d) === 'pulada')
  return plano.tarefas.filter((t) => (t.status === 'pendente' || t.status === 'falhou') && depsOk(t)).map((t) => t.id)
}

/** Motivo de uma tarefa não poder ser marcada, para a dica do checkbox. */
export function motivoIndisponivel(plano: Pick<Plano, 'tarefas'>, t: Tarefa): string | null {
  if (t.status === 'em-andamento') return 'Em andamento'
  if (t.status === 'concluida') return 'Já concluída'
  if (t.status === 'pulada') return 'Pulada'
  const status = new Map(plano.tarefas.map((x) => [x.id, x.status]))
  const faltam = t.dependeDe.filter((d) => status.get(d) !== 'concluida' && status.get(d) !== 'pulada')
  return faltam.length > 0 ? `Depende de ${faltam.join(', ')}` : null
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')

function sobrepoe(a: string, b: string): boolean {
  const x = norm(a)
  const y = norm(b)
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`)
}

/** Pares de tarefas marcadas cujos arquivos de escrita se sobrepõem (risco de conflito na mesma pasta). */
export function conflitosDeArquivos(plano: Pick<Plano, 'tarefas'>, ids: string[]): [string, string][] {
  const marcadas = plano.tarefas.filter((t) => ids.includes(t.id))
  const pares: [string, string][] = []
  for (let i = 0; i < marcadas.length; i++) {
    for (let j = i + 1; j < marcadas.length; j++) {
      const a = marcadas[i]
      const b = marcadas[j]
      if (a.arquivos.some((x) => b.arquivos.some((y) => sobrepoe(x, y)))) pares.push([a.id, b.id])
    }
  }
  return pares
}

/** Status do plano depois de uma mudança numa tarefa. */
export function statusDerivado(tarefas: Pick<Tarefa, 'status'>[], atual: StatusPlano): StatusPlano {
  if (atual === 'cancelado') return atual
  if (tarefas.length > 0 && tarefas.every((t) => t.status === 'concluida' || t.status === 'pulada')) return 'concluido'
  if (tarefas.some((t) => t.status === 'em-andamento')) return 'em-execucao'
  if (tarefas.some((t) => t.status === 'falhou')) return 'parcial'
  if (tarefas.some((t) => t.status === 'concluida' || t.status === 'pulada')) return 'em-execucao'
  return atual
}

export const nomeBranchPlano = (planoId: string) => `orch/${planoId}`
export const nomeBranchTarefa = (planoId: string, tarefa: string) => `orch/${planoId}-${tarefa.toLowerCase()}`

/** Prompt de uma tarefa avulsa (a skill do plugin ≥ 0.5.0 trata o modo --tarefa). */
export function promptTarefa(planoId: string, tarefa: string, arquivoPlano: string | null): string {
  const base = `/orch:orquestrar --tarefa ${planoId} ${tarefa}`
  return arquivoPlano ? `${base}\nPlano: ${arquivoPlano}` : base
}

/** Prompt para executar/retomar o plano inteiro (modo automático), com o limite de paralelismo. */
export function promptPlano(planoId: string, paralelo: number): string {
  return `/orch:orquestrar --executar ${planoId} --paralelo ${limitarParalelo(paralelo)}`
}

/** A primeira linha "RESULTADO: …" da resposta final; sem ela, o começo do texto. */
export function resumoDoResultado(texto: string, max = 400): string {
  const m = texto.match(/^\s*\**RESULTADO\**\s*:\s*(.+)$/im)
  const base = (m ? m[1] : texto).trim().replace(/\s+/g, ' ')
  return base.length > max ? `${base.slice(0, max - 1)}…` : base
}

export function limitarParalelo(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 3
  return Math.min(LIMITE_PARALELO, Math.max(1, v))
}

const MODOS: ModoExecucao[] = ['automatico', 'manual']
const ISOLAMENTOS: Isolamento[] = ['mesma-pasta', 'branch', 'worktree']
const MERGES: MergeWorktree[] = ['manual', 'automatico']

type CamposExecucao = Pick<Configuracao, 'maxParalelo' | 'modoExecucaoPadrao' | 'isolamento' | 'mergeWorktree'>

/** Garante valores válidos nos campos de execução (arquivo antigo ou editado à mão). */
export function normalizarConfigExecucao(c: Partial<CamposExecucao>): CamposExecucao {
  return {
    maxParalelo: limitarParalelo(c.maxParalelo),
    modoExecucaoPadrao: MODOS.includes(c.modoExecucaoPadrao as ModoExecucao) ? (c.modoExecucaoPadrao as ModoExecucao) : 'automatico',
    isolamento: ISOLAMENTOS.includes(c.isolamento as Isolamento) ? (c.isolamento as Isolamento) : 'mesma-pasta',
    mergeWorktree: MERGES.includes(c.mergeWorktree as MergeWorktree) ? (c.mergeWorktree as MergeWorktree) : 'manual'
  }
}

type ChaveItem = Pick<ItemFila, 'projeto' | 'plano' | 'tarefa'>

/** Fila FIFO de tarefas esperando vaga. Sem duplicatas (projeto + plano + tarefa). */
export class FilaTarefas {
  private itens: ItemFila[] = []

  private igual(a: ChaveItem, b: ChaveItem): boolean {
    return a.projeto === b.projeto && a.plano === b.plano && a.tarefa === b.tarefa
  }

  tem(i: ChaveItem): boolean {
    return this.itens.some((x) => this.igual(x, i))
  }

  adicionar(i: ItemFila): boolean {
    if (this.tem(i)) return false
    this.itens.push(i)
    return true
  }

  remover(i: ChaveItem): boolean {
    const antes = this.itens.length
    this.itens = this.itens.filter((x) => !this.igual(x, i))
    return this.itens.length !== antes
  }

  /** Tira da frente da fila quantos couberem nas vagas livres. */
  retirar(rodando: number, limite: number): ItemFila[] {
    const vagas = Math.max(0, limite - rodando)
    return this.itens.splice(0, vagas)
  }

  listar(): ItemFila[] {
    return [...this.itens]
  }
}
