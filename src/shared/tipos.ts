// Tipos compartilhados entre o processo principal, o preload e a interface.

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
}

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
}

// ---------- Sessões (execuções do Claude Code via Agent SDK) ----------

export type ModoPermissao = 'default' | 'acceptEdits' | 'auto' | 'plan'

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
}

export interface StatusLogin {
  logado: boolean
  metodo: string | null
  /** Preenchido quando não foi possível consultar o Claude Code. */
  erro: string | null
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
  | { tipo: 'subagente'; quando: string; fase: 'inicio' | 'fim'; descricao: string; agente: string | null; status?: string }
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

export interface Sessao {
  id: string
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
  log: EntradaLog[]
  pendencias: Pendencia[]
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
  }
  sessoes: {
    listar(): Promise<Sessao[]>
    iniciar(nova: NovaSessao): Promise<Sessao>
    enviar(id: string, texto: string): Promise<void>
    responder(id: string, pendencia: string, resposta: RespostaPendencia): Promise<void>
    interromper(id: string): Promise<void>
    encerrar(id: string): Promise<void>
    descartar(id: string): Promise<void>
    aoMudar(cb: (sessao: Sessao) => void): () => void
  }
  config: {
    ler(): Promise<Configuracao>
    salvar(c: Configuracao): Promise<Configuracao>
    escolherPasta(): Promise<string | null>
    definirTema(t: Tema): Promise<Configuracao>
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
