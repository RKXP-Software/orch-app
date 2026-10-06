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
import type {
  Configuracao,
  EntradaLog,
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

  constructor(
    private publicar: (s: Sessao) => void,
    private config: () => Configuracao
  ) {}

  listar(): Sessao[] {
    return [...this.sessoes.values()].map((i) => i.sessao)
  }

  async iniciar(nova: NovaSessao): Promise<Sessao> {
    const sessao: Sessao = {
      id: randomUUID(),
      titulo: nova.titulo,
      projeto: nova.projeto,
      prompt: nova.prompt,
      modoPermissao: nova.modoPermissao,
      modelo: nova.modelo,
      status: 'iniciando',
      iniciada: agora(),
      sessionIdClaude: null,
      plugins: [],
      orchCarregado: null,
      custoUsd: 0,
      log: [{ tipo: 'usuario', quando: agora(), texto: nova.prompt }],
      pendencias: []
    }
    const interna: Interna = {
      sessao,
      fila: new FilaEntrada(),
      abort: new AbortController(),
      query: null,
      respostas: new Map(),
      subagentes: new Map()
    }
    this.sessoes.set(sessao.id, interna)
    interna.fila.enviar(nova.prompt)
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
      permissionMode: i.sessao.modoPermissao,
      canUseTool: this.canUseTool(i),
      ...(cfg.pluginLocal ? { plugins: [{ type: 'local', path: cfg.pluginLocal }] } : {}),
      ...((i.sessao.modelo || cfg.modeloPadrao) ? { model: i.sessao.modelo || cfg.modeloPadrao } : {}),
      pathToClaudeCodeExecutable: executavelClaude(cfg)
    }

    try {
      const { query } = await import('@anthropic-ai/claude-agent-sdk')
      i.query = query({ prompt: i.fila, options })
      this.mudarStatus(i, 'executando')
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
          this.log(i, { tipo: 'subagente', quando: agora(), fase: 'inicio', descricao: m.description, agente })
        } else if (m.subtype === 'task_notification') {
          const agente = (m.tool_use_id && i.subagentes.get(m.tool_use_id)) || null
          this.log(i, {
            tipo: 'subagente',
            quando: agora(),
            fase: 'fim',
            descricao: corta(m.summary, 400),
            agente,
            status: m.status
          })
        }
        break

      case 'assistant': {
        const sub = m.parent_tool_use_id ? (i.subagentes.get(m.parent_tool_use_id) ?? 'subagente') : null
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
      const id = randomUUID()
      const pendencia: Pendencia =
        ferramenta === 'AskUserQuestion'
          ? { id, tipo: 'pergunta', perguntas: (input.questions ?? []) as Pergunta[] }
          : {
              id,
              tipo: 'permissao',
              ferramenta,
              titulo: opcoes.title ?? `Claude quer usar ${ferramenta}`,
              detalhe: [resumoFerramenta(ferramenta, input), opcoes.decisionReason, opcoes.blockedPath]
                .filter(Boolean)
                .join('\n'),
              podeLembrar: (opcoes.suggestions?.length ?? 0) > 0
            }

      const resposta = await new Promise<RespostaPendencia>((resolve) => {
        i.respostas.set(id, resolve)
        i.sessao.pendencias = [...i.sessao.pendencias, pendencia]
        i.sessao.status = 'aguardando-voce'
        this.emitir(i, true)
        opcoes.signal.addEventListener('abort', () =>
          resolve({ tipo: 'permissao', decisao: 'negar', mensagem: 'Cancelado.' })
        )
      })

      i.respostas.delete(id)
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
      const lembrar: PermissionUpdate[] | undefined =
        resposta.decisao === 'permitir-sempre' ? opcoes.suggestions : undefined
      return { behavior: 'allow', updatedInput: input, ...(lembrar ? { updatedPermissions: lembrar } : {}) }
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
  private emitir(i: Interna, jaJa = false): void {
    const id = i.sessao.id
    if (jaJa) {
      clearTimeout(this.timers.get(id))
      this.timers.delete(id)
      this.publicar(i.sessao)
      return
    }
    if (this.timers.has(id)) return
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id)
        this.publicar(i.sessao)
      }, 100)
    )
  }
}
