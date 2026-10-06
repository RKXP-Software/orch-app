// Observa .claude/orch/planos/ de cada projeto aberto e publica a lista de planos a cada mudança.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { FSWatcher } from 'chokidar'
import { ordenarPlanos, planoDoJson, planoDoMd } from '@shared/plano'
import type { Plano } from '@shared/tipos'

type Ouvinte = (projeto: string, planos: Plano[]) => void

export const pastaPlanos = (projeto: string) => join(projeto, '.claude', 'orch', 'planos')

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
