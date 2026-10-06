// Abre o CLI interativo do Claude Code numa janela de terminal do Windows, já com o prompt.
// O progresso dos planos continua aparecendo no app pelo observador de arquivos.

import { execFile, spawn } from 'node:child_process'
import type { Configuracao, NovaSessao, StatusLogin } from '@shared/tipos'
import { executavelClaude } from './sessoes'

/** Argumento entre aspas para a linha do cmd; aspas internas viram apóstrofos. */
function arg(s: string): string {
  return `"${s.replace(/"/g, "'").replace(/[\r\n]+/g, ' ')}"`
}

export function linhaDeComando(nova: NovaSessao, cfg: Configuracao): string {
  const partes = [executavelClaude(cfg)]
  const modelo = nova.modelo || cfg.modeloPadrao
  if (modelo) partes.push('--model', modelo)
  if (cfg.pluginLocal) partes.push('--plugin-dir', cfg.pluginLocal)
  if (nova.modoPermissao !== 'default') partes.push('--permission-mode', nova.modoPermissao)
  partes.push(nova.prompt)
  return partes.map(arg).join(' ')
}

export function abrirNoTerminal(nova: NovaSessao, cfg: Configuracao): void {
  abrirJanela(nova.projeto, linhaDeComando(nova, cfg), 'Orch - Claude Code')
}

export function abrirLogin(cfg: Configuracao): void {
  const pasta = process.env.USERPROFILE ?? process.cwd()
  abrirJanela(pasta, `${arg(executavelClaude(cfg))} auth login`, 'Orch - Login do Claude Code')
}

export function statusLogin(cfg: Configuracao): Promise<StatusLogin> {
  return new Promise((resolve) => {
    execFile(executavelClaude(cfg), ['auth', 'status'], { timeout: 20_000, windowsHide: true }, (erro, stdout) => {
      try {
        const j = JSON.parse(stdout) as { loggedIn?: boolean; authMethod?: string }
        resolve({ logado: j.loggedIn === true, metodo: j.authMethod ?? null, erro: null })
      } catch {
        resolve({ logado: false, metodo: null, erro: erro?.message ?? 'Resposta inesperada do Claude Code' })
      }
    })
  })
}

function abrirJanela(pasta: string, comando: string, titulo: string): void {
  // cmd /k ""exe" "arg" …": o par de aspas externo é removido pelo próprio cmd.
  const linha = `start "${titulo}" /D ${arg(pasta)} cmd /k "${comando}"`
  const filho = spawn('cmd.exe', ['/d', '/s', '/c', `"${linha}"`], {
    cwd: pasta,
    detached: true,
    stdio: 'ignore',
    windowsVerbatimArguments: true
  })
  filho.unref()
}
