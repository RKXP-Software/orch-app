// Execuções gravadas no projeto, em .claude/orch/execucoes/<data>-<título>.json:
// conversa, ferramentas, aprovações, modelo, custo e contexto, para reabrir e continuar depois.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { ResumoExecucao, Sessao, StatusSessao } from '@shared/tipos'

export const pastaExecucoes = (projeto: string) => join(projeto, '.claude', 'orch', 'execucoes')

function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'execucao'
  )
}

/** Nome do arquivo: data/hora local de início + título + 6 caracteres do id (sem colisão). */
export function nomeDoArquivo(s: Pick<Sessao, 'id' | 'titulo' | 'iniciada'>): string {
  const d = new Date(s.iniciada)
  const p = (n: number) => String(n).padStart(2, '0')
  const data = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
  return `${data}-${slug(s.titulo)}-${s.id.slice(0, 6)}.json`
}

/** Só nomes simples dentro da pasta de execuções. */
function caminho(projeto: string, arquivo: string): string {
  const nome = basename(arquivo)
  if (nome !== arquivo || !nome.endsWith('.json')) throw new Error(`Arquivo de execução inválido: ${arquivo}`)
  return join(pastaExecucoes(projeto), nome)
}

export function salvarExecucao(s: Sessao): void {
  if (!s.arquivo) return
  const destino = caminho(s.projeto, s.arquivo)
  mkdirSync(pastaExecucoes(s.projeto), { recursive: true })
  // Pendências dependem do processo vivo: não fazem sentido no arquivo.
  const dados = { schema: 'orch.execucao/1', ...s, pendencias: [], atualizada: new Date().toISOString() }
  const tmp = `${destino}.tmp`
  writeFileSync(tmp, JSON.stringify(dados, null, 1), 'utf8')
  renameSync(tmp, destino)
}

/** Uma execução lida do disco sem processo vivo terminou quando o app fechou. */
function statusNoDisco(st: StatusSessao): StatusSessao {
  if (st === 'ociosa') return 'concluida'
  if (st === 'iniciando' || st === 'executando' || st === 'aguardando-voce') return 'interrompida'
  return st
}

export function lerExecucao(projeto: string, arquivo: string): Sessao | null {
  try {
    const s = JSON.parse(readFileSync(caminho(projeto, arquivo), 'utf8')) as Sessao
    return { ...s, projeto, arquivo, pendencias: [], status: statusNoDisco(s.status), log: s.log ?? [] }
  } catch {
    return null
  }
}

export function listarExecucoes(projeto: string, vivas: Sessao[]): ResumoExecucao[] {
  const pasta = pastaExecucoes(projeto)
  if (!existsSync(pasta)) return []
  const lista: ResumoExecucao[] = []
  for (const arquivo of readdirSync(pasta).filter((a) => a.endsWith('.json'))) {
    const viva = vivas.find((v) => v.projeto === projeto && v.arquivo === arquivo)
    const s = viva ?? lerExecucao(projeto, arquivo)
    if (!s) continue
    lista.push({
      arquivo,
      titulo: s.titulo,
      prompt: s.prompt,
      iniciada: s.iniciada,
      status: s.status,
      modelo: s.modelo,
      custoUsd: s.custoUsd,
      mensagens: s.log.filter((e) => e.tipo === 'usuario').length,
      podeContinuar: !!s.sessionIdClaude,
      idAoVivo: viva?.id ?? null
    })
  }
  return lista.sort((a, b) => b.iniciada.localeCompare(a.iniciada))
}

export function excluirExecucao(projeto: string, arquivo: string): void {
  const c = caminho(projeto, arquivo)
  if (existsSync(c)) unlinkSync(c)
}
