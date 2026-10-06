// Execução manual de planos: cada tarefa roda numa sessão própria, com modelo próprio, respeitando o limite
// de paralelismo (o que passa do limite espera numa fila). O app é quem grava o estado das tarefas no .json.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import {
  FilaTarefas,
  nomeBranchPlano,
  nomeBranchTarefa,
  promptTarefa,
  resumoDoResultado,
  tarefasSelecionaveis
} from '@shared/execucao'
import type { Configuracao, ItemFila, OpcoesExecucao, PedidoTarefa, Sessao } from '@shared/tipos'
import * as git from './git'
import { alterarTarefa, arquivoJsonDoPlano, lerPlanoJson, pastaPlanos } from './planos'
import type { FimDeTurno, GerenciadorSessoes } from './sessoes'

interface Ativa {
  projeto: string
  plano: string
  tarefa: string
  titulo: string
  opcoes: OpcoesExecucao
  /** Worktree desta tarefa, quando houver. */
  pasta: string | null
  branch: string | null
}

const chave = (i: { projeto: string; plano: string; tarefa: string }) => `${i.projeto}|${i.plano}|${i.tarefa}`

/** Pasta fora do projeto, para as worktrees não aparecerem no git status dele. */
export const pastaWorktrees = (projeto: string) => join(dirname(projeto), `${basename(projeto)}.orch-worktrees`)

export class ExecutorTarefas {
  private fila = new FilaTarefas()
  private opcoes = new Map<string, OpcoesExecucao>()
  /** Tarefas ocupando uma vaga: da saída da fila até o fim (inclui as que ainda estão sendo preparadas). */
  private emCurso = new Set<string>()
  private porSessao = new Map<string, Ativa>()

  constructor(
    private sessoes: Pick<GerenciadorSessoes, 'iniciar' | 'listar' | 'encerrar'>,
    private config: () => Configuracao,
    private publicarFila: (fila: ItemFila[]) => void
  ) {}

  listarFila(): ItemFila[] {
    return this.fila.listar()
  }

  /** Marca as tarefas como esperando e inicia as que couberem no limite. Valida tudo antes de mudar qualquer coisa. */
  async executar(projeto: string, planoId: string, pedidos: PedidoTarefa[], opcoes: OpcoesExecucao): Promise<void> {
    if (pedidos.length === 0) return
    const plano = lerPlanoJson(projeto, planoId)
    const permitidas = new Set(tarefasSelecionaveis(plano))
    for (const p of pedidos) {
      const k = chave({ projeto, plano: planoId, tarefa: p.tarefa })
      if (!plano.tarefas.some((t) => t.id === p.tarefa)) throw new Error(`Tarefa ${p.tarefa} não existe neste plano.`)
      if (this.emCurso.has(k) || this.fila.tem({ projeto, plano: planoId, tarefa: p.tarefa })) {
        throw new Error(`${p.tarefa} já está em execução ou na fila.`)
      }
      if (!permitidas.has(p.tarefa)) throw new Error(`${p.tarefa} não está pronta: conclua as dependências antes.`)
    }

    if (opcoes.isolamento === 'branch') {
      const r = await git.garantirBranch(projeto, nomeBranchPlano(planoId))
      if (!r.ok) throw new Error(`Não foi possível usar o branch do plano: ${r.saida}`)
    }

    for (const p of pedidos) {
      const item: ItemFila = { projeto, plano: planoId, tarefa: p.tarefa, modelo: p.modelo }
      this.fila.adicionar(item)
      this.opcoes.set(chave(item), opcoes)
    }
    this.bombear()
  }

  cancelarNaFila(projeto: string, plano: string, tarefa: string): void {
    if (this.fila.remover({ projeto, plano, tarefa })) {
      this.opcoes.delete(chave({ projeto, plano, tarefa }))
      this.publicarFila(this.fila.listar())
    }
  }

  /** Dispara o que cabe nas vagas livres. Chamada ao enfileirar, ao terminar uma tarefa e ao mudar o limite. */
  bombear(): void {
    const iniciar = this.fila.retirar(this.emCurso.size, this.config().maxParalelo)
    for (const item of iniciar) {
      this.emCurso.add(chave(item))
      void this.iniciarTarefa(item)
    }
    this.publicarFila(this.fila.listar())
  }

  private liberar(item: { projeto: string; plano: string; tarefa: string }): void {
    const k = chave(item)
    this.emCurso.delete(k)
    this.opcoes.delete(k)
    this.bombear()
  }

  private async iniciarTarefa(item: ItemFila): Promise<void> {
    const k = chave(item)
    const opcoes = this.opcoes.get(k) ?? { isolamento: 'mesma-pasta', mergeWorktree: 'manual' }
    try {
      const plano = lerPlanoJson(item.projeto, item.plano)
      const t = plano.tarefas.find((x) => x.id === item.tarefa)
      if (!t) throw new Error(`Tarefa ${item.tarefa} não encontrada.`)

      let pasta: string | null = null
      let branch: string | null = null
      if (opcoes.isolamento === 'worktree') {
        branch = nomeBranchTarefa(item.plano, item.tarefa)
        pasta = join(pastaWorktrees(item.projeto), `${item.plano}-${item.tarefa}`)
        if (!existsSync(pasta)) {
          const r = await git.criarWorktree(item.projeto, pasta, branch)
          if (!r.ok) throw new Error(`Não foi possível criar a worktree: ${r.saida}`)
        }
      }

      alterarTarefa(
        item.projeto,
        item.plano,
        item.tarefa,
        {
          status: 'em-andamento',
          inicio: new Date().toISOString(),
          fim: null,
          tentativas: t.tentativas + 1,
          resultado: null,
          modelo: item.modelo || this.config().modeloPadrao || null,
          pasta,
          merge: null
        },
        { tipo: t.status === 'falhou' ? 'tarefa-reenviada' : 'tarefa-iniciada', texto: `${t.id} iniciada por ${t.executor}` }
      )

      const sessao = await this.sessoes.iniciar({
        projeto: item.projeto,
        prompt: promptTarefa(item.plano, item.tarefa, arquivoJsonDoPlano(item.projeto, item.plano)),
        titulo: `${t.id}: ${t.titulo}`,
        modoPermissao: 'default',
        modelo: item.modelo,
        plano: item.plano,
        tarefa: item.tarefa,
        pasta
      })
      this.porSessao.set(sessao.id, { ...item, titulo: t.titulo, opcoes, pasta, branch })
      alterarTarefa(item.projeto, item.plano, item.tarefa, { sessaoApp: sessao.id })
    } catch (e) {
      this.registrarFalha(item, e instanceof Error ? e.message : String(e))
      this.liberar(item)
    }
  }

  private registrarFalha(item: { projeto: string; plano: string; tarefa: string }, motivo: string): void {
    try {
      alterarTarefa(
        item.projeto,
        item.plano,
        item.tarefa,
        { status: 'falhou', fim: new Date().toISOString(), resultado: motivo, sessaoApp: null },
        { tipo: 'tarefa-falhou', texto: `${item.tarefa} falhou: ${motivo}` }
      )
    } catch {
      // Plano apagado ou ilegível: nada a registrar.
    }
  }

  /** Chamado pelo gerenciador de sessões ao fim de cada turno ou da sessão. */
  aoTerminar(sessao: Sessao, fim: FimDeTurno): void {
    const a = this.porSessao.get(sessao.id)
    if (!a) return
    this.porSessao.delete(sessao.id)
    void this.concluir(sessao, a, fim)
  }

  private async concluir(sessao: Sessao, a: Ativa, fim: FimDeTurno): Promise<void> {
    try {
      if (!fim.sucesso) {
        this.registrarFalha(a, resumoDoResultado(fim.texto) || 'Sem detalhes.')
        return
      }
      const resumo = resumoDoResultado(fim.texto)
      let merge: 'pendente' | 'mesclado' | 'conflito' | null = null
      let aviso = ''
      let encerrar = false

      if (a.pasta && a.branch) {
        const reg = await git.registrarTudo(a.pasta, `orch: ${a.tarefa} ${a.titulo}`)
        if (!reg.ok) {
          merge = 'pendente'
          aviso = ` Não foi possível registrar as alterações da worktree: ${reg.saida}`
        } else if ((await git.commitsAFrente(a.projeto, a.branch)) === 0) {
          // A tarefa não alterou arquivos: não há o que mesclar.
          await git.removerWorktree(a.projeto, a.pasta, a.branch)
          encerrar = true
        } else if (a.opcoes.mergeWorktree === 'automatico') {
          const m = await git.mesclar(a.projeto, a.branch)
          if (m.ok) {
            merge = 'mesclado'
            await git.removerWorktree(a.projeto, a.pasta, a.branch)
            encerrar = true
          } else {
            merge = 'conflito'
            aviso = ' Merge com conflito: resolva e use "Mesclar" de novo.'
          }
        } else {
          merge = 'pendente'
        }
      }

      alterarTarefa(
        a.projeto,
        a.plano,
        a.tarefa,
        { status: 'concluida', fim: new Date().toISOString(), resultado: resumo, sessaoApp: null, merge },
        { tipo: 'tarefa-concluida', texto: `${a.tarefa} concluída.${aviso}` }
      )
      // Worktree removida: a sessão não tem mais pasta de trabalho.
      if (encerrar) this.sessoes.encerrar(sessao.id)
    } catch {
      // O plano pode ter sido apagado no meio da execução.
    } finally {
      this.liberar(a)
    }
  }

  /** Mescla a worktree de uma tarefa concluída (modo manual de merge, ou nova tentativa depois de um conflito). */
  async mesclar(projeto: string, planoId: string, tarefaId: string): Promise<void> {
    const plano = lerPlanoJson(projeto, planoId)
    const t = plano.tarefas.find((x) => x.id === tarefaId)
    if (!t || !t.pasta) throw new Error('Esta tarefa não tem worktree para mesclar.')
    const branch = nomeBranchTarefa(planoId, tarefaId)
    const m = await git.mesclar(projeto, branch)
    if (!m.ok) {
      alterarTarefa(projeto, planoId, tarefaId, { merge: 'conflito' }, { tipo: 'tarefa-merge-conflito', texto: `${tarefaId}: conflito no merge.` })
      throw new Error(`Conflito ao mesclar ${branch}. Resolva os conflitos no projeto e tente de novo.\n${m.saida}`)
    }
    await git.removerWorktree(projeto, t.pasta, branch)
    alterarTarefa(projeto, planoId, tarefaId, { merge: 'mesclado' }, { tipo: 'tarefa-mesclada', texto: `${tarefaId} mesclada.` })
  }

  pular(projeto: string, planoId: string, tarefaId: string): void {
    if (this.emCurso.has(chave({ projeto, plano: planoId, tarefa: tarefaId }))) {
      throw new Error('A tarefa está em execução; interrompa a sessão antes de pular.')
    }
    alterarTarefa(
      projeto,
      planoId,
      tarefaId,
      { status: 'pulada', fim: new Date().toISOString(), sessaoApp: null },
      { tipo: 'tarefa-pulada', texto: `${tarefaId} pulada pelo usuário.` }
    )
  }

  /**
   * Tarefas que o app deixou em andamento e cuja sessão não existe mais (o app foi fechado no meio) voltam a pendente.
   * Tarefas marcadas pelo plugin (modo automático ou CLI) não têm `sessaoApp` e não são tocadas.
   */
  recuperarOrfas(projeto: string): void {
    const pasta = pastaPlanos(projeto)
    if (!existsSync(pasta)) return
    const vivas = new Set(this.sessoes.listar().map((s) => s.id))
    for (const arq of readdirSync(pasta).filter((a) => a.endsWith('.json'))) {
      try {
        const raw = JSON.parse(readFileSync(join(pasta, arq), 'utf8')) as { id?: string; tarefas?: { id: string; status: string; sessaoApp?: string | null }[] }
        for (const t of raw.tarefas ?? []) {
          if (t.status === 'em-andamento' && t.sessaoApp && !vivas.has(t.sessaoApp) && raw.id) {
            alterarTarefa(
              projeto,
              raw.id,
              t.id,
              { status: 'pendente', sessaoApp: null, inicio: null },
              { tipo: 'tarefa-interrompida', texto: `${t.id} voltou a pendente: a sessão foi encerrada com o app.` }
            )
          }
        }
      } catch {
        // Arquivo ilegível: o observador de planos já cuida de mostrar o último estado válido.
      }
    }
  }
}
