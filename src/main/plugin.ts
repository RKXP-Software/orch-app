// Atualização do plugin orch instalado no Claude Code (a mesma instalação que o CLI usa).

import { execFile } from 'node:child_process'
import type { Configuracao, ResultadoAtualizacaoPlugin, StatusPlugin } from '@shared/tipos'
import { executavelClaude } from './sessoes'

const MARKETPLACE_PADRAO = 'orch-marketplace'

function claude(cfg: Configuracao, args: string[], timeout = 120_000): Promise<{ ok: boolean; saida: string }> {
  return new Promise((resolve) => {
    execFile(executavelClaude(cfg), ['plugin', ...args], { timeout, windowsHide: true, maxBuffer: 5 * 1024 * 1024 }, (erro, stdout, stderr) => {
      resolve({ ok: !erro, saida: `${stdout ?? ''}\n${stderr ?? ''}`.trim() || (erro?.message ?? '') })
    })
  })
}

export async function statusPlugin(cfg: Configuracao): Promise<StatusPlugin> {
  const usaLocal = cfg.pluginLocal.trim() !== ''
  const r = await claude(cfg, ['list', '--json'], 30_000)
  try {
    const lista = JSON.parse(r.saida) as { id: string; version?: string }[]
    const orch = lista.find((p) => p.id === 'orch' || p.id.startsWith('orch@'))
    return { instalado: !!orch, id: orch?.id ?? null, versao: orch?.version ?? null, usaPastaLocal: usaLocal, erro: null }
  } catch {
    return { instalado: false, id: null, versao: null, usaPastaLocal: usaLocal, erro: r.saida || 'Não foi possível consultar o Claude Code.' }
  }
}

/** Atualiza o catálogo do marketplace e depois o plugin. Sessões já abertas continuam com a versão antiga. */
export async function atualizarPlugin(cfg: Configuracao): Promise<ResultadoAtualizacaoPlugin> {
  const antes = await statusPlugin(cfg)
  if (!antes.instalado || !antes.id) {
    return {
      ok: false,
      versaoAntes: null,
      versaoDepois: null,
      mensagem: 'O plugin orch não está instalado no Claude Code. Instale com: /plugin install orch@orch-marketplace'
    }
  }
  const marketplace = antes.id.split('@')[1] || MARKETPLACE_PADRAO
  const catalogo = await claude(cfg, ['marketplace', 'update', marketplace])
  if (!catalogo.ok) {
    return { ok: false, versaoAntes: antes.versao, versaoDepois: antes.versao, mensagem: `Não foi possível atualizar o catálogo do marketplace.\n${catalogo.saida}` }
  }
  const plugin = await claude(cfg, ['update', antes.id])
  const depois = await statusPlugin(cfg)
  return {
    ok: plugin.ok,
    versaoAntes: antes.versao,
    versaoDepois: depois.versao,
    mensagem: plugin.saida
  }
}
