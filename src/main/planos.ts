// Observa .claude/orch/planos/ de cada projeto aberto e publica a lista de planos a cada mudança.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
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

export class ObservadorPlanos {
  private observadores = new Map<string, FSWatcher>()
  private timers = new Map<string, NodeJS.Timeout>()

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
    }
    return lerPlanos(projeto)
  }

  async parar(projeto: string): Promise<void> {
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
      setTimeout(() => this.ouvinte(projeto, lerPlanos(projeto)), 100)
    )
  }
}
