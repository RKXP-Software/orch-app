import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as git from '../src/main/git'

const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

describe('worktrees por tarefa', () => {
  let raiz: string
  let projeto: string
  let pasta: string

  beforeEach(() => {
    raiz = mkdtempSync(join(tmpdir(), 'orch-wt-'))
    projeto = join(raiz, 'proj')
    pasta = join(raiz, 'proj.orch-worktrees', 'p1-T1')
    execFileSync('git', ['init', '-b', 'main', projeto])
    g(projeto, 'config', 'user.email', 't@t')
    g(projeto, 'config', 'user.name', 't')
    writeFileSync(join(projeto, 'a.txt'), 'base\n')
    g(projeto, 'add', '-A')
    g(projeto, 'commit', '-m', 'base')
  })

  afterEach(() => rmSync(raiz, { recursive: true, force: true }))

  it('cria, registra, mescla e remove', async () => {
    expect((await git.criarWorktree(projeto, pasta, 'orch/p1-t1')).ok).toBe(true)
    expect(existsSync(pasta)).toBe(true)

    expect((await git.registrarTudo(pasta, 'nada')).saida).toBe('')
    expect(await git.commitsAFrente(projeto, 'orch/p1-t1')).toBe(0)

    writeFileSync(join(pasta, 'b.txt'), 'nova\n')
    expect((await git.registrarTudo(pasta, 'orch: T1')).ok).toBe(true)
    expect(await git.commitsAFrente(projeto, 'orch/p1-t1')).toBe(1)

    expect((await git.mesclar(projeto, 'orch/p1-t1')).ok).toBe(true)
    expect(readFileSync(join(projeto, 'b.txt'), 'utf8')).toBe('nova\n')

    await git.removerWorktree(projeto, pasta, 'orch/p1-t1')
    expect(existsSync(pasta)).toBe(false)
    expect(g(projeto, 'branch', '--list', 'orch/p1-t1')).toBe('')
  })

  it('desfaz o merge em caso de conflito', async () => {
    await git.criarWorktree(projeto, pasta, 'orch/p1-t1')
    writeFileSync(join(pasta, 'a.txt'), 'da tarefa\n')
    await git.registrarTudo(pasta, 'orch: T1')
    writeFileSync(join(projeto, 'a.txt'), 'do projeto\n')
    g(projeto, 'commit', '-am', 'mudou no projeto')

    const r = await git.mesclar(projeto, 'orch/p1-t1')
    expect(r.ok).toBe(false)
    expect(g(projeto, 'status', '--porcelain')).toBe('')
    expect(readFileSync(join(projeto, 'a.txt'), 'utf8')).toBe('do projeto\n')
  })

  it('garantirBranch cria o branch do plano uma vez e reaproveita', async () => {
    expect((await git.garantirBranch(projeto, 'orch/p1')).ok).toBe(true)
    expect(g(projeto, 'branch', '--show-current')).toBe('orch/p1')
    g(projeto, 'switch', 'main')
    expect((await git.garantirBranch(projeto, 'orch/p1')).ok).toBe(true)
    expect(g(projeto, 'branch', '--show-current')).toBe('orch/p1')
  })
})
