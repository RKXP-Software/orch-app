// Tipos compartilhados entre o processo principal, o preload e a interface.

import type { Branch, Commit, LinhaDiff, ResultadoGit, StatusGit } from './git'
import type { Quadro } from './quadro'

// ---------- Planos (contrato com o plugin orch: schema orch.plano/1) ----------

export type StatusPlano = 'planejado' | 'em-execucao' | 'concluido' | 'parcial' | 'cancelado'
export type StatusTarefa = 'pendente' | 'em-andamento' | 'concluida' | 'falhou' | 'pulada'

export interface Tarefa {
  id: string
  titulo: string
  executor: string
  dependeDe: string[]
  arquivos: string[]
  prontoQuando: string | null
  status: StatusTarefa
  inicio: string | null
  fim: string | null
  tentativas: number
  resultado: string | null
  /** Modelo com que a tarefa foi executada pelo app (execução manual). */
  modelo: string | null
  /** Sessão do app que está executando a tarefa; serve para recuperar tarefas órfãs ao reabrir o app. */
  sessaoApp: string | null
  /** Pasta de trabalho da tarefa quando executada numa worktree. */
  pasta: string | null
  /** Situação do merge da worktree de volta no projeto. */
  merge: EstadoMerge | null
}

export type EstadoMerge = 'pendente' | 'mesclado' | 'conflito'

export interface EventoPlano {
  quando: string
  tarefa: string | null
  tipo: string
  texto: string
}

export interface Plano {
  id: string
  titulo: string
  status: StatusPlano
  demanda: string
  objetivo: string | null
  grupo: string | null
  dependeDosPlanos: string[]
  criado: string | null
  atualizado: string | null
  commitInicial: string | null
  versaoOrch: string | null
  ondas: string[][]
  tarefas: Tarefa[]
  eventos: EventoPlano[]
  resultadoFinal: string | null
  /** De onde o estado foi lido: o .json do plugin ≥ 0.4.0 ou o .md (planos antigos). */
  origem: 'json' | 'md'
  arquivoMd: string | null
}

// ---------- Projetos ----------

export interface Projeto {
  caminho: string
  nome: string
  ultimoUso: string
}

export interface InfoProjeto {
  caminho: string
  existe: boolean
  temPerfil: boolean
  perfil: string | null
}

export type Tema = 'sistema' | 'claro' | 'escuro'

export interface Configuracao {
  /** Pasta de um plugin orch local (ex.: checkout de desenvolvimento). Vazio = usar o orch instalado no Claude Code. */
  pluginLocal: string
  /** Executável do Claude Code. Vazio = o embutido no SDK. */
  executavelClaude: string
  modeloPadrao: string
  tema: Tema
  /** Notificação do Windows quando uma execução espera aprovação ou resposta. */
  notificacoes: boolean
  /** Máximo de tarefas em paralelo (1–6), nos modos automático e manual. */
  maxParalelo: number
  /** Como um plano é executado por padrão. */
  modoExecucaoPadrao: ModoExecucao
  /** Onde as tarefas trabalham: na pasta do projeto, numa branch do plano ou numa worktree por tarefa. */
  isolamento: Isolamento
  /** Com worktree: mesclar de volta sozinho ao concluir a tarefa ou só pelo botão. */
  mergeWorktree: MergeWorktree
}

export type ModoExecucao = 'automatico' | 'manual'
export type Isolamento = 'mesma-pasta' | 'branch' | 'worktree'
export type MergeWorktree = 'manual' | 'automatico'

export const LIMITE_PARALELO = 6

/** Opções de uma execução de plano (padrões vêm da Configuracao). */
export interface OpcoesExecucao {
  isolamento: Isolamento
  mergeWorktree: MergeWorktree
}

/** Tarefa esperando vaga para executar (fila FIFO no processo principal). */
export interface ItemFila {
  projeto: string
  plano: string
  tarefa: string
  modelo: string
}

export interface PedidoTarefa {
  tarefa: string
  /** Vazio = usar o modelo da configuração. */
  modelo: string
}

// ---------- Sessões (execuções do Claude Code via Agent SDK) ----------

export type ModoPermissao = 'default' | 'acceptEdits' | 'auto' | 'livre' | 'plan'

export type StatusSessao =
  | 'iniciando'
  | 'executando'
  | 'aguardando-voce'
  | 'ociosa'
  | 'concluida'
  | 'erro'
  | 'interrompida'

export interface NovaSessao {
  projeto: string
  /** Texto enviado como primeiro prompt, ex.: "/orch:orquestrar --executar 20261004-1530-login". */
  prompt: string
  titulo: string
  modoPermissao: ModoPermissao
  /** Modelo do Claude (alias ou id, ex.: "opus", "claude-sonnet-5-5"). Vazio = padrão das configurações. */
  modelo: string
  /** Execução de uma tarefa de plano (modo manual): liga a sessão à tarefa. */
  plano?: string | null
  tarefa?: string | null
  /** Pasta onde o Claude trabalha, se não for a do projeto (worktree). */
  pasta?: string | null
}

export interface StatusLogin {
  logado: boolean
  metodo: string | null
  /** Preenchido quando não foi possível consultar o Claude Code. */
  erro: string | null
}

export interface StatusPlugin {
  instalado: boolean
  /** Ex.: "orch@orch-marketplace". */
  id: string | null
  versao: string | null
  /** Configurações aponta uma pasta local do plugin: ela tem prioridade sobre a instalação. */
  usaPastaLocal: boolean
  erro: string | null
}

export interface ResultadoAtualizacaoPlugin {
  ok: boolean
  versaoAntes: string | null
  versaoDepois: string | null
  mensagem: string
}

export interface Modelo {
  valor: string
  nome: string
  descricao: string
}

export type EntradaLog =
  | { tipo: 'usuario'; quando: string; texto: string }
  | { tipo: 'texto'; quando: string; texto: string; subagente: string | null }
  | { tipo: 'ferramenta'; quando: string; nome: string; resumo: string; subagente: string | null }
  | { tipo: 'saida'; quando: string; texto: string; erro: boolean; subagente: string | null }
  | {
      tipo: 'subagente'
      quando: string
      fase: 'inicio' | 'fim'
      /** Liga o início ao fim do mesmo subagente. */
      id: string | null
      descricao: string
      agente: string | null
      status?: string
    }
  | { tipo: 'sistema'; quando: string; texto: string }
  | { tipo: 'erro'; quando: string; texto: string }
  | { tipo: 'resultado'; quando: string; texto: string; sucesso: boolean; custoUsd: number; duracaoMs: number }

export interface OpcaoPergunta {
  label: string
  description: string
}

export interface Pergunta {
  question: string
  header: string
  multiSelect: boolean
  options: OpcaoPergunta[]
}

export type Pendencia =
  | {
      id: string
      tipo: 'permissao'
      ferramenta: string
      titulo: string
      detalhe: string
      podeLembrar: boolean
    }
  | { id: string; tipo: 'pergunta'; perguntas: Pergunta[] }

export type RespostaPendencia =
  | { tipo: 'permissao'; decisao: 'permitir' | 'permitir-sempre' | 'negar'; mensagem?: string }
  | { tipo: 'pergunta'; respostas: Record<string, string> }

export interface CategoriaContexto {
  nome: string
  tokens: number
  /** used = ocupa a janela; free = livre; buffer = reserva para compactação; deferred = fora da janela. */
  tipo: 'used' | 'free' | 'buffer' | 'deferred'
}

export interface ContextoSessao {
  usados: number
  maximo: number
  pct: number
  categorias: CategoriaContexto[]
  memoria: { caminho: string; tokens: number }[]
  /** Quando veio do detalhamento do Claude Code (fim de turno) ou foi estimado pelo uso de tokens. */
  origem: 'detalhado' | 'estimado'
  atualizado: string
}

export interface ResumoExecucao {
  arquivo: string
  titulo: string
  prompt: string
  iniciada: string
  status: StatusSessao
  modelo: string
  custoUsd: number
  /** Mensagens enviadas pelo usuário. */
  mensagens: number
  /** Tem o id da conversa do Claude, então dá para continuar. */
  podeContinuar: boolean
  /** Se a execução está aberta agora, o id dela no app. */
  idAoVivo: string | null
}

export interface Sessao {
  id: string
  /** Nome do arquivo em .claude/orch/execucoes/ onde a execução é gravada. */
  arquivo: string | null
  titulo: string
  projeto: string
  prompt: string
  modoPermissao: ModoPermissao
  modelo: string
  status: StatusSessao
  iniciada: string
  sessionIdClaude: string | null
  plugins: { nome: string; versao: string | null }[]
  orchCarregado: boolean | null
  custoUsd: number
  contexto: ContextoSessao | null
  log: EntradaLog[]
  pendencias: Pendencia[]
  plano?: string | null
  tarefa?: string | null
  pasta?: string | null
}

// ---------- API exposta pelo preload ----------

export interface OrchApi {
  projetos: {
    listar(): Promise<Projeto[]>
    escolher(): Promise<Projeto | null>
    remover(caminho: string): Promise<Projeto[]>
    info(caminho: string): Promise<InfoProjeto>
  }
  planos: {
    observar(projeto: string): Promise<Plano[]>
    pararDeObservar(projeto: string): Promise<void>
    aoMudar(cb: (projeto: string, planos: Plano[]) => void): () => void
    /** Execução manual: inicia as tarefas (as que passam do limite entram na fila). */
    executarTarefas(projeto: string, plano: string, pedidos: PedidoTarefa[], opcoes: OpcoesExecucao): Promise<void>
    pularTarefa(projeto: string, plano: string, tarefa: string): Promise<void>
    mesclarTarefa(projeto: string, plano: string, tarefa: string): Promise<void>
    /** Vai para o branch do plano (criando-o), para o modo automático com isolamento por branch. */
    prepararBranch(projeto: string, plano: string): Promise<void>
    fila(): Promise<ItemFila[]>
    cancelarNaFila(projeto: string, plano: string, tarefa: string): Promise<void>
    aoMudarFila(cb: (fila: ItemFila[]) => void): () => void
  }
  sessoes: {
    listar(): Promise<Sessao[]>
    iniciar(nova: NovaSessao): Promise<Sessao>
    enviar(id: string, texto: string): Promise<void>
    responder(id: string, pendencia: string, resposta: RespostaPendencia): Promise<void>
    interromper(id: string): Promise<void>
    encerrar(id: string): Promise<void>
    descartar(id: string): Promise<void>
    mudarModo(id: string, modo: ModoPermissao): Promise<void>
    /** Reabre uma execução gravada e retoma a mesma conversa do Claude. */
    continuar(projeto: string, arquivo: string): Promise<Sessao>
    atualizarContexto(id: string): Promise<void>
    aoMudar(cb: (sessao: Sessao) => void): () => void
    /** Pedido para abrir uma execução (ex.: clique na notificação). */
    aoAbrir(cb: (id: string) => void): () => void
  }
  config: {
    ler(): Promise<Configuracao>
    salvar(c: Configuracao): Promise<Configuracao>
    escolherPasta(): Promise<string | null>
    definirTema(t: Tema): Promise<Configuracao>
  }
  execucoes: {
    listar(projeto: string): Promise<ResumoExecucao[]>
    ler(projeto: string, arquivo: string): Promise<Sessao | null>
    excluir(projeto: string, arquivo: string): Promise<void>
  }
  quadro: {
    ler(projeto: string): Promise<Quadro>
    salvar(projeto: string, quadro: Quadro): Promise<Quadro>
  }
  git: {
    status(projeto: string): Promise<StatusGit>
    diff(projeto: string, caminho: string, preparado: boolean): Promise<LinhaDiff[]>
    preparar(projeto: string, caminhos: string[]): Promise<ResultadoGit>
    tirarDaPreparacao(projeto: string, caminhos: string[]): Promise<ResultadoGit>
    descartar(projeto: string, caminhos: string[]): Promise<ResultadoGit>
    commit(projeto: string, mensagem: string, todos: boolean): Promise<ResultadoGit>
    buscar(projeto: string): Promise<ResultadoGit>
    pull(projeto: string): Promise<ResultadoGit>
    push(projeto: string): Promise<ResultadoGit>
    branches(projeto: string): Promise<Branch[]>
    trocarBranch(projeto: string, nome: string, remota: boolean): Promise<ResultadoGit>
    criarBranch(projeto: string, nome: string, trocar: boolean): Promise<ResultadoGit>
    apagarBranch(projeto: string, nome: string): Promise<ResultadoGit>
    log(projeto: string): Promise<Commit[]>
    iniciar(projeto: string): Promise<ResultadoGit>
  }
  plugin: {
    status(): Promise<StatusPlugin>
    /** Atualiza o plugin orch instalado no Claude Code (marketplace + plugin). */
    atualizar(): Promise<ResultadoAtualizacaoPlugin>
  }
  modelos(): Promise<Modelo[]>
  login: {
    status(): Promise<StatusLogin>
    /** Abre um terminal com `claude auth login` para o usuário entrar na conta. */
    abrir(): Promise<void>
  }
  /** Abre o CLI do Claude Code numa janela de terminal, no projeto, com o prompt e o modelo. */
  abrirNoTerminal(nova: NovaSessao): Promise<void>
  abrirArquivo(caminho: string): Promise<void>
}
