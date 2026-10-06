// Leitura e gravação do quadro de demandas do projeto (.claude/orch/quadro.json).

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { lerQuadro, quadroVazio, type Quadro } from '@shared/quadro'

const arquivo = (projeto: string) => join(projeto, '.claude', 'orch', 'quadro.json')

export function lerQuadroDoProjeto(projeto: string): Quadro {
  const a = arquivo(projeto)
  if (!existsSync(a)) return quadroVazio()
  try {
    return lerQuadro(JSON.parse(readFileSync(a, 'utf8')))
  } catch {
    return quadroVazio()
  }
}

/** Grava num arquivo temporário e renomeia: nunca fica um JSON pela metade. */
export function salvarQuadro(projeto: string, quadro: Quadro): Quadro {
  const limpo = lerQuadro(quadro)
  const a = arquivo(projeto)
  mkdirSync(dirname(a), { recursive: true })
  const tmp = `${a}.tmp`
  writeFileSync(tmp, `${JSON.stringify(limpo, null, 2)}\n`, 'utf8')
  renameSync(tmp, a)
  return limpo
}
