// Execuções do Claude Code via Agent SDK. Cada sessão roda um prompt (ex.: /orch:orquestrar …)
// num projeto, repassa pedidos de permissão e perguntas à interface e aceita mensagens de resposta.

import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  CanUseTool,
  Options,
  PermissionResult,
  PermissionUpdate,
  Query,
  SDKMessage,
  SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import { aprovaSozinho, infoModo, modoDoSdk } from '@shared/permissoes'
import { lerExecucao, nomeDoArquivo, salvarExecucao } from './execucoes'
import type {
  Configuracao,
  ContextoSessao,
  EntradaLog,
  ModoPermissao,
  Modelo,
  NovaSessao,
  Pendencia,
  Pergunta,
  RespostaPendencia,
  Sessao
} from '@shared/tipos'

const MAX_LOG = 3000
const MAX_SAIDA = 4000

/** Reserva para quando não dá para perguntar ao Claude Code quais modelos a conta tem. */
const MODELOS_RESERVA: Modelo[] = [
  { valor: 'opus', nome: 'Opus', descricao: 'Mais capaz, para planos complexos' },
  { valor: 'sonnet', nome: 'Sonnet', descricao: 'Equilíbrio entre qualidade e velocidade' },
  { valor: 'haiku', nome: 'Haiku', descricao: 'Mais rápido e barato' }
]

/** Fila de mensagens do usuário consumida pelo SDK (modo de entrada por streaming). */
class FilaEntrada implements AsyncIterable<SDKUserMessage> {
  private itens: SDKUserMessage[] = []
  private espera: ((r: IteratorResult<SDKUserMessage>) => void) | null = null
  private fechada = false

  enviar(texto: string): void {
    if (this.fechada) return
    const msg = {
      type: 'user',
      message: { role: 'user', content: texto },
      parent_tool_use_id: null
    } as SDKUserMessage
    if (this.espera) {
      this.espera({ value: msg, done: false })
      this.espera = null
    } else {
      this.itens.push(msg)
    }
  }

  fechar(): void {
    this.fechada = true
    this.espera?.({ value: undefined, done: true })
    this.espera = null
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const item = this.itens.shift()
        if (item) return Promise.resolve({ value: item, done: false })
        if (this.fechada) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => (this.espera = resolve))
      }
    }
  }
}

interface Interna {
  sessao: Sessao
  fila: FilaEntrada
  abort: AbortController
  query: Query | null
  respostas: Map<string, (r: RespostaPendencia) => void>
  /** tool_use_id da chamada Agent → nome do subagente, para rotular o que ele faz. */
  subagentes: Map<string, string>
  /** Pedidos de permissão pendentes: id → ferramenta (para resolver ao trocar de modo). */
  ferramentasPendentes: Map<string, string>
  /** Tamanho da janela de contexto do modelo, quando já conhecido. */
  janela: number
  /** Id da conversa do Claude a retomar (execução reaberta). */
  retomar: string | null
}

const agora = () => new Date().toISOString()

const DICA_LOGIN =
  '\n\nO Claude Code não está logado nesta máquina. Use o botão "Fazer login" no topo do app e tente de novo.'
const ehErroDeLogin = (s: string) => /not logged in|please run \/login/i.test(s)

function corta(s: string, n = 300): string {
  const linha = s.replace(/\s+/g, ' ').trim()
  return linha.length > n ? `${linha.slice(0, n)}…` : linha
}

export function resumoFerramenta(nome: string, input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (nome) {
    case 'Bash':
    case 'PowerShell':
      return corta(s('command'))
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return s('file_path')
    case 'Grep':
    case 'Glob':
      return `${s('pattern')}${s('path') ? ` em ${s('path')}` : ''}`
    case 'Agent':
    case 'Task':
      return `${s('subagent_type') || 'agente'}: ${s('description')}`
    case 'Skill':
      return `${s('skill')} ${s('args')}`.trim()
    case 'AskUserQuestion': {
      const qs = Array.isArray(input.questions) ? (input.questions as { question?: string }[]) : []
      return qs.map((q) => q.question ?? '').filter(Boolean).join(' · ')
    }
    case 'ExitPlanMode':
      return 'plano proposto para aprovação'
    case 'WebFetch':
      return s('url')
    case 'WebSearch':
      return s('query')
    default:
      return corta(JSON.stringify(input))
  }
}

/**
 * Binário do Claude Code que vem com o SDK. Em produção ele fica fora do asar
 * (o SDK não consegue executá-lo de dentro do pacote).
 */
export function executavelEmbutido(): string | undefined {
  const base = app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked') : app.getAppPath()
  const exe = join(base, 'node_modules', '@anthropic-ai', 'claude-agent-sdk-win32-x64', 'claude.exe')
  return existsSync(exe) ? exe : undefined
}

/** Executável usado pelo app: o das Configurações ou o embutido (mesmo login para os dois). */
export function executavelClaude(cfg: Configuracao): string {
  return cfg.executavelClaude || executavelEmbutido() || 'claude'
}

let modelosEmCache: Modelo[] | null = null

/** Pergunta ao Claude Code quais modelos esta conta pode usar (sessão curta, sem enviar prompt). */
export async function listarModelos(cfg: Configuracao): Promise<Modelo[]> {
  if (modelosEmCache) return modelosEmCache
  const abort = new AbortController()
  const fila = new FilaEntrada()
  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    const q = query({
      prompt: fila,
      options: { abortController: abort, pathToClaudeCodeExecutable: executavelClaude(cfg) }
    })
    const lista = await Promise.race([
      q.supportedModels(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 20_000))
    ])
    modelosEmCache = lista.map((m) => ({ valor: m.value, nome: m.displayName, descricao: m.description }))
    return modelosEmCache
  } catch {
    return MODELOS_RESERVA
  } finally {
    fila.fechar()
    abort.abort()
  }
}

export class GerenciadorSessoes {
  private sessoes = new Map<string, Interna>()
  private timers = new Map<string, NodeJS.Timeout>()
  private gravacoes = new Map<string, NodeJS.Timeout>()

  constructor(
    private publicar: (s: Sessao) => void,
    private config: () => Configuracao,
    private aoPendencia: (s: Sessao, p: Pendencia) => void = () => undefined
  ) {}

  listar(): Sessao[] {
    return [...this.sessoes.values()].map((i) => i.sessao)
  }

  async iniciar(nova: NovaSessao): Promise<Sessao> {
    const id = randomUUID()
    const iniciada = agora()
    const sessao: Sessao = {
      id,
      arquivo: nomeDoArquivo({ id, titulo: nova.titulo, iniciada }),
      titulo: nova.titulo,
      projeto: nova.projeto,
      prompt: nova.prompt,
      modoPermissao: nova.modoPermissao,
      modelo: nova.modelo,
      status: 'iniciando',
      iniciada,
      sessionIdClaude: null,
      plugins: [],
      orchCarregado: null,
      custoUsd: 0,
      contexto: null,
      log: [{ tipo: 'usuario', quando: agora(), texto: nova.prompt }],
      pendencias: []
    }
    const interna: Interna = {
      sessao,
      fila: new FilaEntrada(),
      abort: new AbortController(),
      query: null,
      respostas: new Map(),
      subagentes: new Map(),
      ferramentasPendentes: new Map(),
      janela: 0,
      retomar: null
    }
    this.sessoes.set(sessao.id, interna)
    interna.fila.enviar(nova.prompt)
    void this.rodar(interna)
    return sessao
  }

  /** Reabre uma execução gravada: o histórico vem do arquivo e a conversa do Claude é retomada (resume). */
  async continuar(projeto: string, arquivo: string): Promise<Sessao> {
    const viva = [...this.sessoes.values()].find((i) => i.sessao.projeto === projeto && i.sessao.arquivo === arquivo)
    if (viva) return viva.sessao
    const salva = lerExecucao(projeto, arquivo)
    if (!salva) throw new Error('Execução não encontrada.')
    if (!salva.sessionIdClaude) throw new Error('Esta execução não chegou a iniciar a conversa com o Claude; não há o que continuar.')
    const sessao: Sessao = {
      ...salva,
      id: randomUUID(),
      status: 'ociosa',
      pendencias: [],
      log: [...salva.log, { tipo: 'sistema', quando: agora(), texto: 'Conversa retomada. Envie uma mensagem para continuar.' }]
    }
    const interna: Interna = {
      sessao,
      fila: new FilaEntrada(),
      abort: new AbortController(),
      query: null,
      respostas: new Map(),
      subagentes: new Map(),
      ferramentasPendentes: new Map(),
      janela: salva.contexto?.maximo ?? 0,
      retomar: salva.sessionIdClaude
    }
    this.sessoes.set(sessao.id, interna)
    void this.rodar(interna)
    return sessao
  }

  enviar(id: string, texto: string): void {
    const i = this.sessoes.get(id)
    if (!i || !texto.trim()) return
    i.fila.enviar(texto)
    this.log(i, { tipo: 'usuario', quando: agora(), texto })
    this.mudarStatus(i, 'executando')
  }

  responder(id: string, pendencia: string, resposta: RespostaPendencia): void {
    const i = this.sessoes.get(id)
    const resolver = i?.respostas.get(pendencia)
    if (!i || !resolver) return
    resolver(resposta)
  }

  /** Troca o modo de permissão com a sessão em andamento. */
  async mudarModo(id: string, modo: ModoPermissao): Promise<void> {
    const i = this.sessoes.get(id)
    if (!i || i.sessao.modoPermissao === modo) return
    i.sessao.modoPermissao = modo
    await i.query?.setPermissionMode(modoDoSdk(modo)).catch(() => undefined)
    this.log(i, { tipo: 'sistema', quando: agora(), texto: `Permissões: ${infoModo(modo).nome}` })
    // Pedidos que estavam esperando e que o novo modo aprova sozinho seguem na hora.
    for (const [pid, ferramenta] of i.ferramentasPendentes) {
      if (aprovaSozinho(modo, ferramenta)) i.respostas.get(pid)?.({ tipo: 'permissao', decisao: 'permitir' })
    }
    this.emitir(i, true)
  }

  /** Detalhamento do contexto (o mesmo do /context do CLI). "summary" não gasta chamadas de contagem de tokens. */
  async atualizarContexto(id: string, detalhe: 'summary' | 'full' = 'summary'): Promise<void> {
    const i = this.sessoes.get(id)
    if (!i?.query) return
    try {
      const c = await i.query.getContextUsage({ detail: detalhe })
      i.janela = c.maxTokens || i.janela
      const contexto: ContextoSessao = {
        usados: c.totalTokens,
        maximo: c.maxTokens,
        pct: Math.round(c.percentage),
        categorias: c.categories
          .filter((x) => x.tokens > 0)
          .map((x) => ({ nome: x.name, tokens: x.tokens, tipo: x.kind })),
        memoria: c.memoryFiles.map((m) => ({ caminho: m.path, tokens: m.tokens })),
        origem: 'detalhado',
        atualizado: agora()
      }
      i.sessao.contexto = contexto
      this.emitir(i, true)
    } catch {
      // Sessão já encerrada ou CLI sem suporte: mantém o último valor.
    }
  }

  async interromper(id: string): Promise<void> {
    const i = this.sessoes.get(id)
    if (!i?.query) return
    await i.query.interrupt().catch(() => undefined)
    this.log(i, { tipo: 'sistema', quando: agora(), texto: 'Interrompido pelo usuário.' })
  }

  encerrar(id: string): void {
    const i = this.sessoes.get(id)
    if (!i) return
    i.fila.fechar()
    if (['executando', 'aguardando-voce', 'iniciando'].includes(i.sessao.status)) {
      i.abort.abort()
      this.mudarStatus(i, 'interrompida')
    }
  }

  descartar(id: string): void {
    this.encerrar(id)
    this.sessoes.delete(id)
  }

  encerrarTodas(): void {
    for (const id of this.sessoes.keys()) this.encerrar(id)
  }

  // ---------- execução ----------

  private async rodar(i: Interna): Promise<void> {
    const cfg = this.config()
    const options: Options = {
      cwd: i.sessao.projeto,
      abortController: i.abort,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      settingSources: ['user', 'project', 'local'],
      permissionMode: modoDoSdk(i.sessao.modoPermissao),
      canUseTool: this.canUseTool(i),
      ...(cfg.pluginLocal ? { plugins: [{ type: 'local', path: cfg.pluginLocal }] } : {}),
      ...((i.sessao.modelo || cfg.modeloPadrao) ? { model: i.sessao.modelo || cfg.modeloPadrao } : {}),
      pathToClaudeCodeExecutable: executavelClaude(cfg),
      ...(i.retomar ? { resume: i.retomar } : {})
    }

    try {
      const { query } = await import('@anthropic-ai/claude-agent-sdk')
      i.query = query({ prompt: i.fila, options })
      // Retomada: fica esperando a primeira mensagem do usuário.
      if (!i.retomar) this.mudarStatus(i, 'executando')
      for await (const m of i.query) this.tratar(i, m)
      if (!['erro', 'interrompida'].includes(i.sessao.status)) this.mudarStatus(i, 'concluida')
    } catch (e) {
      if (i.sessao.status === 'erro') {
        // Já registrado no resultado (ex.: sem login); o SDK relança o mesmo erro ao fechar.
      } else if (i.abort.signal.aborted) {
        this.mudarStatus(i, 'interrompida')
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        this.log(i, { tipo: 'erro', quando: agora(), texto: msg + (ehErroDeLogin(msg) ? DICA_LOGIN : '') })
        this.mudarStatus(i, 'erro')
      }
    } finally {
      for (const [pid, resolver] of i.respostas) {
        resolver({ tipo: 'permissao', decisao: 'negar', mensagem: 'Sessão encerrada.' })
        i.respostas.delete(pid)
      }
      i.sessao.pendencias = []
      this.emitir(i, true)
      this.gravar(i, true)
    }
  }

  private tratar(i: Interna, m: SDKMessage): void {
    const s = i.sessao
    switch (m.type) {
      case 'system':
        if (m.subtype === 'init') {
          s.sessionIdClaude = m.session_id
          s.modelo = m.model
          s.plugins = m.plugins.map((p) => ({ nome: p.name, versao: p.version ?? null }))
          const orch = s.plugins.find((p) => p.nome === 'orch')
          s.orchCarregado = !!orch
          this.log(i, {
            tipo: 'sistema',
            quando: agora(),
            texto: `Sessão iniciada · ${m.model} · Claude Code ${m.claude_code_version} · ${
              orch ? `orch ${orch.versao ?? ''}`.trim() : 'orch NÃO carregado'
            }`
          })
          // Já mostra o tamanho da janela e o que ocupa o contexto desde o início.
          void this.atualizarContexto(s.id)
          if (!orch) {
            this.log(i, {
              tipo: 'erro',
              quando: agora(),
              texto:
                'O plugin orch não foi carregado. Instale-o no Claude Code (/plugin install orch@orch-marketplace) ou aponte a pasta do plugin em Configurações.'
            })
          }
        } else if (m.subtype === 'task_started') {
          const agente = m.subagent_type ?? null
          if (m.tool_use_id) i.subagentes.set(m.tool_use_id, agente ?? m.description)
          this.log(i, {
            tipo: 'subagente',
            quando: agora(),
            fase: 'inicio',
            id: m.tool_use_id ?? m.task_id,
            descricao: m.description,
            agente
          })
        } else if (m.subtype === 'task_notification') {
          const agente = (m.tool_use_id && i.subagentes.get(m.tool_use_id)) || null
          this.log(i, {
            tipo: 'subagente',
            quando: agora(),
            fase: 'fim',
            id: m.tool_use_id ?? m.task_id,
            descricao: corta(m.summary, 400),
            agente,
            status: m.status
          })
        }
        break

      case 'assistant': {
        const sub = m.parent_tool_use_id ? (i.subagentes.get(m.parent_tool_use_id) ?? 'subagente') : null
        if (!sub) this.estimarContexto(i, m.message.usage)
        for (const bloco of m.message.content) {
          // O erro de login vem também como texto; ele é mostrado uma vez, como erro, no resultado.
          if (bloco.type === 'text' && !sub && bloco.text.trim() && !ehErroDeLogin(bloco.text)) {
            this.log(i, { tipo: 'texto', quando: agora(), texto: bloco.text, subagente: null })
          } else if (bloco.type === 'tool_use' && bloco.name !== 'Agent' && bloco.name !== 'Task') {
            this.log(i, {
              tipo: 'ferramenta',
              quando: agora(),
              nome: bloco.name,
              resumo: resumoFerramenta(bloco.name, (bloco.input ?? {}) as Record<string, unknown>),
              subagente: sub
            })
          }
        }
        break
      }

      case 'user': {
        // Resultados das ferramentas: aparecem na visão Terminal, como no CLI.
        const conteudo = m.message.content
        if (typeof conteudo === 'string') break
        const sub = m.parent_tool_use_id ? (i.subagentes.get(m.parent_tool_use_id) ?? 'subagente') : null
        for (const bloco of conteudo) {
          if (bloco.type !== 'tool_result' || i.subagentes.has(bloco.tool_use_id)) continue
          const texto =
            typeof bloco.content === 'string'
              ? bloco.content
              : (bloco.content ?? [])
                  .map((c) => (c.type === 'text' ? c.text : `[${c.type}]`))
                  .join('\n')
          if (!texto.trim()) continue
          this.log(i, {
            tipo: 'saida',
            quando: agora(),
            texto:
              texto.length > MAX_SAIDA
                ? `${texto.slice(0, MAX_SAIDA)}\n… (${texto.length - MAX_SAIDA} caracteres omitidos)`
                : texto,
            erro: bloco.is_error === true,
            subagente: sub
          })
        }
        break
      }

      case 'result': {
        s.custoUsd = m.total_cost_usd
        const janela = Object.values(m.modelUsage ?? {}).reduce((mx, u) => Math.max(mx, u.contextWindow ?? 0), 0)
        if (janela) i.janela = janela
        void this.atualizarContexto(s.id)
        const sucesso = m.subtype === 'success' && !m.is_error
        this.log(i, {
          tipo: 'resultado',
          quando: agora(),
          texto: m.subtype === 'success' ? m.result : `Execução terminou com erro (${m.subtype}).`,
          sucesso,
          custoUsd: m.total_cost_usd,
          duracaoMs: m.duration_ms
        })
        if (m.is_error && m.subtype === 'success' && ehErroDeLogin(m.result)) {
          // Sem login nada vai funcionar nesta sessão: encerra em vez de esperar mensagem.
          i.sessao.log.pop() // o "turno com erro" acima não acrescenta nada aqui
          this.log(i, { tipo: 'erro', quando: agora(), texto: m.result + DICA_LOGIN })
          this.mudarStatus(i, 'erro')
          i.fila.fechar()
          break
        }
        // A sessão continua aberta esperando outra mensagem (ex.: confirmar a execução do plano).
        this.mudarStatus(i, 'ociosa')
        break
      }
    }
  }

  private canUseTool(i: Interna): CanUseTool {
    return async (ferramenta, input, opcoes): Promise<PermissionResult> => {
      if (aprovaSozinho(i.sessao.modoPermissao, ferramenta)) {
        return { behavior: 'allow', updatedInput: input }
      }

      const id = randomUUID()
      const planoProposto = ferramenta === 'ExitPlanMode' && typeof input.plan === 'string' ? input.plan : null
      const pendencia: Pendencia =
        ferramenta === 'AskUserQuestion'
          ? { id, tipo: 'pergunta', perguntas: (input.questions ?? []) as Pergunta[] }
          : {
              id,
              tipo: 'permissao',
              ferramenta,
              titulo: planoProposto ? 'Aprovar o plano e começar a executar?' : (opcoes.title ?? `Claude quer usar ${ferramenta}`),
              detalhe:
                planoProposto ??
                [resumoFerramenta(ferramenta, input), opcoes.decisionReason, opcoes.blockedPath].filter(Boolean).join('\n'),
              podeLembrar: !planoProposto && (opcoes.suggestions?.length ?? 0) > 0
            }
      if (pendencia.tipo === 'permissao') i.ferramentasPendentes.set(id, ferramenta)

      const resposta = await new Promise<RespostaPendencia>((resolve) => {
        i.respostas.set(id, resolve)
        i.sessao.pendencias = [...i.sessao.pendencias, pendencia]
        i.sessao.status = 'aguardando-voce'
        this.emitir(i, true)
        this.aoPendencia(i.sessao, pendencia)
        opcoes.signal.addEventListener('abort', () =>
          resolve({ tipo: 'permissao', decisao: 'negar', mensagem: 'Cancelado.' })
        )
      })

      i.respostas.delete(id)
      i.ferramentasPendentes.delete(id)
      i.sessao.pendencias = i.sessao.pendencias.filter((p) => p.id !== id)
      if (i.sessao.pendencias.length === 0 && i.sessao.status === 'aguardando-voce') {
        this.mudarStatus(i, 'executando')
      } else {
        this.emitir(i)
      }

      if (resposta.tipo === 'pergunta') {
        this.log(i, {
          tipo: 'usuario',
          quando: agora(),
          texto: Object.entries(resposta.respostas)
            .map(([q, r]) => `${q} → ${r}`)
            .join('\n')
        })
        return { behavior: 'allow', updatedInput: { ...input, answers: resposta.respostas } }
      }
      if (resposta.decisao === 'negar') {
        return { behavior: 'deny', message: resposta.mensagem || 'O usuário negou a permissão.' }
      }
      if (planoProposto && i.sessao.modoPermissao === 'plan') {
        // Plano aprovado: o Claude Code sai do modo somente leitura.
        i.sessao.modoPermissao = 'default'
        this.log(i, { tipo: 'sistema', quando: agora(), texto: `Plano aprovado · Permissões: ${infoModo('default').nome}` })
      }
      const lembrar: PermissionUpdate[] | undefined =
        resposta.decisao === 'permitir-sempre' ? opcoes.suggestions : undefined
      return { behavior: 'allow', updatedInput: input, ...(lembrar ? { updatedPermissions: lembrar } : {}) }
    }
  }

  /** Entre um turno e outro: o contexto ocupado é a entrada da última chamada do agente principal. */
  private estimarContexto(
    i: Interna,
    uso: { input_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | null | undefined
  ): void {
    if (!uso) return
    const usados = (uso.input_tokens ?? 0) + (uso.cache_read_input_tokens ?? 0) + (uso.cache_creation_input_tokens ?? 0)
    if (usados <= 0) return
    const anterior = i.sessao.contexto
    const maximo = anterior?.maximo || i.janela
    i.sessao.contexto = {
      usados,
      maximo,
      pct: maximo ? Math.round((usados / maximo) * 100) : 0,
      categorias: anterior?.categorias ?? [],
      memoria: anterior?.memoria ?? [],
      origem: 'estimado',
      atualizado: agora()
    }
  }

  // ---------- estado ----------

  private log(i: Interna, e: EntradaLog): void {
    i.sessao.log.push(e)
    if (i.sessao.log.length > MAX_LOG) i.sessao.log.splice(0, i.sessao.log.length - MAX_LOG)
    this.emitir(i)
  }

  private mudarStatus(i: Interna, status: Sessao['status']): void {
    if (i.sessao.status === status) return
    i.sessao.status = status
    this.emitir(i, true)
  }

  /** Publica com throttle de 100 ms; mudanças de status e pendências saem na hora. */
  /** Grava a execução no projeto: no máximo a cada 1 s, ou na hora (mudança de status, fim). */
  private gravar(i: Interna, jaJa = false): void {
    const id = i.sessao.id
    const fazer = () => {
      this.gravacoes.delete(id)
      try {
        salvarExecucao(i.sessao)
      } catch {
        // Pasta sem permissão de escrita, por exemplo: a execução continua, só não fica gravada.
      }
    }
    if (jaJa) {
      clearTimeout(this.gravacoes.get(id))
      fazer()
    } else if (!this.gravacoes.has(id)) {
      this.gravacoes.set(id, setTimeout(fazer, 1000))
    }
  }

  private emitir(i: Interna, jaJa = false): void {
    this.gravar(i, jaJa)
    const id = i.sessao.id
    // Fechada pelo usuário: o estado final ainda é gravado, mas não volta para a interface.
    const publicar = () => this.sessoes.has(id) && this.publicar(i.sessao)
    if (jaJa) {
      clearTimeout(this.timers.get(id))
      this.timers.delete(id)
      publicar()
      return
    }
    if (this.timers.has(id)) return
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id)
        publicar()
      }, 100)
    )
  }
}
