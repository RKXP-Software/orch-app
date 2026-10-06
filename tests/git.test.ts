import { execFileSync } from 'node:child_process'
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { diffDeArquivoNovo, FORMATO_BRANCH, FORMATO_LOG, lerBranches, lerDiff, lerLog, lerStatus } from '@shared/git'

let repo = ''
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' })

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'orch-git-'))
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'teste@exemplo.com')
  git('config', 'user.name', 'Teste')
  git('config', 'core.autocrlf', 'false')
  writeFileSync(join(repo, 'a.txt'), 'um\ndois\ntres\n')
  writeFileSync(join(repo, 'velho.txt'), 'conteudo para renomear\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'primeiro commit')
  git('branch', 'outra')

  writeFileSync(join(repo, 'a.txt'), 'um\nDOIS\ntres\nquatro\n') // modificado, não preparado
  renameSync(join(repo, 'velho.txt'), join(repo, 'novo nome.txt'))
  git('add', '-A', '--', 'velho.txt', 'novo nome.txt') // renomeado, preparado
  writeFileSync(join(repo, 'solto.txt'), 'x\n') // não rastreado
})

afterAll(() => rmSync(repo, { recursive: true, force: true }))

describe('lerStatus (saída real do git)', () => {
  it('lê branch e arquivos nos três estados', () => {
    const st = lerStatus(git('status', '--porcelain=v2', '--branch', '-z'))
    expect(st.branch).toBe('main')
    expect(st.semCommits).toBe(false)
    expect(st.upstream).toBeNull()

    const por = Object.fromEntries(st.arquivos.map((a) => [a.caminho, a]))
    expect(por['a.txt']).toMatchObject({ indice: null, arvore: 'modificado' })
    expect(por['novo nome.txt']).toMatchObject({ indice: 'renomeado', arvore: null, origem: 'velho.txt' })
    expect(por['solto.txt']).toMatchObject({ indice: null, arvore: 'nao-rastreado' })
  })

  it('lê ahead/behind do cabeçalho', () => {
    const st = lerStatus('# branch.oid abc\0# branch.head dev\0# branch.upstream origin/dev\0# branch.ab +2 -3\0')
    expect(st).toMatchObject({ branch: 'dev', upstream: 'origin/dev', aFrente: 2, atras: 3 })
  })

  it('repositório sem commits e HEAD destacado', () => {
    expect(lerStatus('# branch.oid (initial)\0# branch.head main\0').semCommits).toBe(true)
    expect(lerStatus('# branch.oid abc\0# branch.head (detached)\0')).toMatchObject({ destacado: true, branch: null })
  })
})

describe('lerBranches e lerLog (saída real do git)', () => {
  it('lista branches locais e marca a atual', () => {
    const bs = lerBranches(git('for-each-ref', `--format=${FORMATO_BRANCH}`, 'refs/heads', 'refs/remotes'))
    expect(bs.map((b) => b.nome).sort()).toEqual(['main', 'outra'])
    expect(bs.find((b) => b.atual)?.nome).toBe('main')
    expect(bs.every((b) => !b.remota && b.assunto === 'primeiro commit')).toBe(true)
  })

  it('ignora origin/HEAD nas remotas', () => {
    const linha = (ref: string, nome: string) => [' ', ref, nome, '', '', '2026-10-06T10:00:00-03:00', 's'].join('\0')
    const bs = lerBranches([linha('refs/remotes/origin/HEAD', 'origin'), linha('refs/remotes/origin/main', 'origin/main')].join('\n'))
    expect(bs).toHaveLength(1)
    expect(bs[0]).toMatchObject({ nome: 'origin/main', remota: true })
  })

  it('lê o histórico', () => {
    const log = lerLog(git('log', '-n', '10', `--format=${FORMATO_LOG}`))
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ autor: 'Teste', assunto: 'primeiro commit' })
    expect(log[0].curto.length).toBeGreaterThanOrEqual(7)
  })
})

describe('lerDiff', () => {
  it('numera linhas antigas e novas', () => {
    const linhas = lerDiff(git('diff', '--', 'a.txt'))
    const corpo = linhas.filter((l) => l.tipo !== 'cabecalho' && l.tipo !== 'trecho')
    expect(corpo).toEqual([
      { tipo: 'contexto', texto: 'um', antiga: 1, nova: 1 },
      { tipo: 'removida', texto: 'dois', antiga: 2, nova: null },
      { tipo: 'adicionada', texto: 'DOIS', antiga: null, nova: 2 },
      { tipo: 'contexto', texto: 'tres', antiga: 3, nova: 3 },
      { tipo: 'adicionada', texto: 'quatro', antiga: null, nova: 4 }
    ])
  })

  it('arquivo novo vira linhas adicionadas', () => {
    const l = diffDeArquivoNovo('a\nb\n')
    expect(l.filter((x) => x.tipo === 'adicionada').map((x) => x.nova)).toEqual([1, 2])
  })

  it('arquivo binário vira aviso', () => {
    expect(lerDiff('diff --git a/x b/x\nBinary files a/x and b/x differ\n').some((l) => l.tipo === 'aviso')).toBe(true)
  })
})
