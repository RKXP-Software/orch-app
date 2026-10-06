// Observa .claude/orch/planos/ de cada projeto aberto e publica a lista de planos a cada mudança.

import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FSWatcher } from 'chokidar'
import { ordenarPlanos, planoDoJson, planoDoMd } from '@shared/plano'
import { statusDerivado } from '@shared/execucao'
import type { Plano, StatusTarefa } from '@shared/tipos'

type Ouvinte = (projeto: string, planos: Plano[]) => void

export const pastaPlanos = (projeto: string) => join(projeto, '.claude', 'orch', 'planos')

export const arquivoJsonDoPlano = (projeto: string, id: string) => join(pastaPlanos(projeto), `${id}.json`)

/** ISO 8601 com o fuso local (2026-10-06T15:30:00-03:00), como o plugin grava. */
export function agoraLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sinal = off >= 0 ? '+' : '-'
  const o = Math.abs(off)
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${sinal}${p(Math.floor(o / 60))}:${p(o % 60)}`
  )
}

export interface MudancaTarefa {
  status?: StatusTarefa
  inicio?: string | null
  fim?: string | null
  tentativas?: number
  resultado?: string | null
  modelo?: string | null
  sessaoApp?: string | null
  pasta?: string | null
  merge?: 'pendente' | 'mesclado' | 'conflito' | null
}

export interface EventoNovo {
  tipo: string
  texto: string
}

/**
 * Altera uma tarefa no .json do plano, registra o evento e recalcula o status do plano.
 * No modo manual o app é o único a gravar o estado das tarefas (várias sessões escrevendo o mesmo arquivo
 * se atropelariam). Leitura e gravação são síncronas: duas mudanças nunca se intercalam.
 */
export function alterarTarefa(projeto: string, planoId: string, tarefaId: string, mudanca: MudancaTarefa, evento?: EventoNovo): void {
  const caminho = arquivoJsonDoPlano(projeto, planoId)
  const raw = JSON.parse(readFileSync(caminho, 'utf8')) as Record<string, unknown>
  const tarefas = Array.isArray(raw.tarefas) ? (raw.tarefas as Record<string, unknown>[]) : []
  const t = tarefas.find((x) => x.id === tarefaId)
  if (!t) throw new Error(`Tarefa ${tarefaId} não encontrada no plano ${planoId}.`)
  Object.assign(t, mudanca)

  const agora = agoraLocal()
  raw.atualizado = agora
  raw.status = statusDerivado(tarefas as { status: StatusTarefa }[], String(raw.status ?? 'planejado') as Plano['status'])
  if (evento) {
    const eventos = Array.isArray(raw.eventos) ? (raw.eventos as unknown[]) : []
    eventos.push({ quando: agora, tarefa: tarefaId, tipo: evento.tipo, texto: evento.texto })
    raw.eventos = eventos
  }
  const tmp = `${caminho}.tmp`
  writeFileSync(tmp, JSON.stringify(raw, null, 2), 'utf8')
  renameSync(tmp, caminho)
}

/** O plano como o app o enxerga agora (só planos com .json podem ser executados tarefa a tarefa). */
export function lerPlanoJson(projeto: string, planoId: string): Plano {
  const caminho = arquivoJsonDoPlano(projeto, planoId)
  if (!existsSync(caminho)) {
    throw new Error('Este plano não tem o arquivo .json (criado por uma versão anterior do orch). Execute-o no modo automático.')
  }
  const md = join(pastaPlanos(projeto), `${planoId}.md`)
  return planoDoJson(JSON.parse(readFileSync(caminho, 'utf8')), existsSync(md) ? md : null)
}

/** Último estado válido de cada arquivo: um JSON lido no meio da escrita não apaga o plano da tela. */
const ultimoValido = new Map<string, Plano>()

export function lerPlanos(projeto: string): Plano[] {
  const pasta = pastaPlanos(projeto)
  if (!existsSync(pasta)) return []

  const arquivos = readdirSync(pasta)
  const jsons = new Set(arquivos.filter((a) => a.endsWith('.json')).map((a) => a.slice(0, -5)))
  const planos: Plano[] = []

  for (const a of arquivos) {
    const caminho = join(pasta, a)
    const base = a.replace(/\.(json|md)$/i, '')
    let plano: Plano | null = null
    try {
      if (a.endsWith('.json')) {
        const md = join(pasta, `${base}.md`)
        plano = planoDoJson(JSON.parse(readFileSync(caminho, 'utf8')), existsSync(md) ? md : null)
      } else if (a.endsWith('.md') && a !== 'INDICE.md' && !jsons.has(base)) {
        plano = planoDoMd(readFileSync(caminho, 'utf8'), caminho)
      }
    } catch {
      plano = ultimoValido.get(caminho) ?? null
    }
    if (plano) {
      ultimoValido.set(caminho, plano)
      planos.push(plano)
    }
  }
  return ordenarPlanos(planos)
}

/** Nome, tamanho e data de cada arquivo: muda sempre que um plano é gravado. */
function assinatura(projeto: string): string {
  const pasta = pastaPlanos(projeto)
  if (!existsSync(pasta)) return ''
  try {
    return readdirSync(pasta)
      .map((a) => {
        const s = statSync(join(pasta, a))
        return `${a}:${s.size}:${s.mtimeMs}`
      })
      .join('|')
  } catch {
    return ''
  }
}

const INTERVALO_CHECAGEM = 1500

export class ObservadorPlanos {
  private observadores = new Map<string, FSWatcher>()
  private timers = new Map<string, NodeJS.Timeout>()
  /**
   * Checagem periódica além do chokidar: cobre a pasta .claude/orch criada depois que o
   * projeto começou a ser observado e eventos de arquivo perdidos no Windows.
   */
  private checagens = new Map<string, NodeJS.Timeout>()
  private assinaturas = new Map<string, string>()

  constructor(private ouvinte: Ouvinte) {}

  async observar(projeto: string): Promise<Plano[]> {
    if (!this.observadores.has(projeto)) {
      // chokidar 5 é ESM-only; o processo principal é CJS.
      const { watch } = await import('chokidar')
      // Observa .claude/orch inteiro: a pasta planos/ pode ainda não existir.
      const w = watch(join(projeto, '.claude', 'orch'), {
        ignoreInitial: true,
        depth: 1,
        awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
      })
      w.on('all', () => this.agendar(projeto))
      this.observadores.set(projeto, w)
      this.assinaturas.set(projeto, assinatura(projeto))
      this.checagens.set(
        projeto,
        setInterval(() => {
          const a = assinatura(projeto)
          if (a !== this.assinaturas.get(projeto)) this.agendar(projeto)
        }, INTERVALO_CHECAGEM)
      )
    }
    return lerPlanos(projeto)
  }

  async parar(projeto: string): Promise<void> {
    clearInterval(this.checagens.get(projeto))
    this.checagens.delete(projeto)
    await this.observadores.get(projeto)?.close()
    this.observadores.delete(projeto)
  }

  async pararTodos(): Promise<void> {
    await Promise.all([...this.observadores.keys()].map((p) => this.parar(p)))
  }

  private agendar(projeto: string): void {
    clearTimeout(this.timers.get(projeto))
    this.timers.set(
      projeto,
      setTimeout(() => {
        this.assinaturas.set(projeto, assinatura(projeto))
        this.ouvinte(projeto, lerPlanos(projeto))
      }, 100)
    )
  }
}
