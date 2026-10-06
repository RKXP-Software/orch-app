// Operações de git do projeto, executando o git instalado na máquina (argumentos em lista, sem shell).

import { execFile } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import {
  diffDeArquivoNovo,
  FORMATO_BRANCH,
  FORMATO_LOG,
  lerBranches,
  lerDiff,
  lerLog,
  lerStatus,
  type Branch,
  type Commit,
  type LinhaDiff,
  type ResultadoGit,
  type StatusGit
} from '@shared/git'

const MAX_SAIDA = 20 * 1024 * 1024
const MAX_ARQUIVO_NOVO = 512 * 1024

function git(projeto: string, args: string[], timeout = 30_000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolver) => {
    execFile(
      'git',
      args,
      {
        cwd: projeto,
        timeout,
        maxBuffer: MAX_SAIDA,
        windowsHide: true,
        // Nunca pedir senha num terminal que ninguém vê; o Git Credential Manager abre a própria janela.
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' }
      },
      (erro, stdout, stderr) => {
        const naoInstalado = (erro as NodeJS.ErrnoException | null)?.code === 'ENOENT'
        resolver({
          ok: !erro,
          stdout: String(stdout ?? ''),
          stderr: naoInstalado ? 'O git não foi encontrado. Instale o Git for Windows e reabra o app.' : String(stderr ?? erro?.message ?? '')
        })
      }
    )
  })
}

async function resultado(projeto: string, args: string[], timeout?: number): Promise<ResultadoGit> {
  const r = await git(projeto, args, timeout)
  return { ok: r.ok, saida: (r.stdout + (r.stderr ? `\n${r.stderr}` : '')).trim() }
}

/** Caminho relativo vindo da interface, garantido dentro do projeto. */
function dentroDoProjeto(projeto: string, caminho: string): string {
  const abs = resolve(projeto, caminho)
  const rel = relative(projeto, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Caminho fora do projeto: ${caminho}`)
  return abs
}

export async function status(projeto: string): Promise<StatusGit> {
  const r = await git(projeto, ['status', '--porcelain=v2', '--branch', '-z'])
  if (!r.ok) {
    return { repo: false, branch: null, destacado: false, upstream: null, aFrente: 0, atras: 0, semCommits: false, arquivos: [] }
  }
  return lerStatus(r.stdout)
}

export async function diff(projeto: string, caminho: string, preparado: boolean): Promise<LinhaDiff[]> {
  const st = await status(projeto)
  const arq = st.arquivos.find((a) => a.caminho === caminho)
  if (arq?.arvore === 'nao-rastreado' && !preparado) {
    const abs = dentroDoProjeto(projeto, caminho)
    if (!existsSync(abs)) return []
    const info = statSync(abs)
    if (info.isDirectory()) {
      return [{ tipo: 'aviso', texto: 'Pasta nova, ainda não rastreada. Prepare-a para ver os arquivos.', antiga: null, nova: null }]
    }
    if (info.size > MAX_ARQUIVO_NOVO) {
      return [{ tipo: 'aviso', texto: `Arquivo novo grande demais para exibir (${Math.round(info.size / 1024)} KB).`, antiga: null, nova: null }]
    }
    const conteudo = readFileSync(abs)
    if (conteudo.includes(0)) {
      return [{ tipo: 'aviso', texto: 'Arquivo binário: o conteúdo não é exibido.', antiga: null, nova: null }]
    }
    return diffDeArquivoNovo(conteudo.toString('utf8'))
  }
  const args = ['-c', 'core.quotepath=false', 'diff', '--no-color', '--no-ext-diff']
  if (preparado) args.push('--cached')
  if (arq?.origem) args.push('-M', '--', arq.origem, caminho)
  else args.push('--', caminho)
  const r = await git(projeto, args)
  return r.ok ? lerDiff(r.stdout) : [{ tipo: 'aviso', texto: r.stderr, antiga: null, nova: null }]
}

export const preparar = (projeto: string, caminhos: string[]) => resultado(projeto, ['add', '-A', '--', ...caminhos])

export async function tirarDaPreparacao(projeto: string, caminhos: string[]): Promise<ResultadoGit> {
  const st = await status(projeto)
  // Sem commits ainda não existe HEAD para restaurar: remove do índice.
  return st.semCommits
    ? resultado(projeto, ['rm', '--cached', '-r', '-q', '--', ...caminhos])
    : resultado(projeto, ['restore', '--staged', '--', ...caminhos])
}

/** Descarta as mudanças não preparadas. Arquivos não rastreados são apagados. */
export async function descartar(projeto: string, caminhos: string[]): Promise<ResultadoGit> {
  const st = await status(projeto)
  const novos = caminhos.filter((c) => st.arquivos.find((a) => a.caminho === c)?.arvore === 'nao-rastreado')
  const rastreados = caminhos.filter((c) => !novos.includes(c))
  const saidas: string[] = []
  let ok = true
  if (rastreados.length) {
    const r = await resultado(projeto, ['restore', '--worktree', '--', ...rastreados])
    ok &&= r.ok
    saidas.push(r.saida)
  }
  if (novos.length) {
    novos.forEach((c) => dentroDoProjeto(projeto, c))
    const r = await resultado(projeto, ['clean', '-f', '-d', '--', ...novos])
    ok &&= r.ok
    saidas.push(r.saida)
  }
  return { ok, saida: saidas.filter(Boolean).join('\n') }
}

export async function commit(projeto: string, mensagem: string, todos: boolean): Promise<ResultadoGit> {
  if (!mensagem.trim()) return { ok: false, saida: 'Escreva a mensagem do commit.' }
  if (todos) {
    const r = await resultado(projeto, ['add', '-A'])
    if (!r.ok) return r
  }
  return resultado(projeto, ['commit', '-m', mensagem])
}

export const buscar = (projeto: string) => resultado(projeto, ['fetch', '--all', '--prune'], 120_000)

export const pull = (projeto: string) => resultado(projeto, ['pull'], 120_000)

export async function push(projeto: string): Promise<ResultadoGit> {
  const st = await status(projeto)
  if (st.upstream) return resultado(projeto, ['push'], 120_000)
  // Branch sem upstream: publica no primeiro remote e passa a rastreá-lo.
  const remotos = (await git(projeto, ['remote'])).stdout.split('\n').map((s) => s.trim()).filter(Boolean)
  if (!remotos.length) return { ok: false, saida: 'Este repositório não tem remote configurado (git remote add origin <url>).' }
  const remoto = remotos.includes('origin') ? 'origin' : remotos[0]
  return resultado(projeto, ['push', '-u', remoto, 'HEAD'], 120_000)
}

export async function branches(projeto: string): Promise<Branch[]> {
  const r = await git(projeto, ['for-each-ref', `--format=${FORMATO_BRANCH}`, '--sort=-committerdate', 'refs/heads', 'refs/remotes'])
  return r.ok ? lerBranches(r.stdout) : []
}

/** Troca de branch; para uma remota (origin/x), cria o branch local x rastreando-a. */
export function trocarBranch(projeto: string, nome: string, remota: boolean): Promise<ResultadoGit> {
  if (remota) return resultado(projeto, ['switch', '--track', nome])
  return resultado(projeto, ['switch', nome])
}

export async function criarBranch(projeto: string, nome: string, trocar: boolean): Promise<ResultadoGit> {
  const valido = await git(projeto, ['check-ref-format', '--branch', nome])
  if (!valido.ok) return { ok: false, saida: `Nome de branch inválido: ${nome}` }
  return trocar ? resultado(projeto, ['switch', '-c', nome]) : resultado(projeto, ['branch', nome])
}

/** Apaga só branches já integrados (-d); o git recusa se houver commits que seriam perdidos. */
export const apagarBranch = (projeto: string, nome: string) => resultado(projeto, ['branch', '-d', nome])

export async function log(projeto: string, n = 50): Promise<Commit[]> {
  const r = await git(projeto, ['log', '-n', String(n), `--format=${FORMATO_LOG}`])
  return r.ok ? lerLog(r.stdout) : []
}

export const iniciarRepo = (projeto: string) => resultado(projeto, ['init'])
