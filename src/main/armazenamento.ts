// Projetos recentes e configuração, gravados em <userData>/orch-app.json.

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Configuracao, InfoProjeto, Projeto } from '@shared/tipos'

interface Dados {
  projetos: Projeto[]
  config: Configuracao
}

const CONFIG_PADRAO: Configuracao = { pluginLocal: '', executavelClaude: '', modeloPadrao: '', tema: 'sistema', notificacoes: true }

const arquivo = () => join(app.getPath('userData'), 'orch-app.json')

function ler(): Dados {
  try {
    const d = JSON.parse(readFileSync(arquivo(), 'utf8')) as Partial<Dados>
    return { projetos: d.projetos ?? [], config: { ...CONFIG_PADRAO, ...d.config } }
  } catch {
    return { projetos: [], config: { ...CONFIG_PADRAO } }
  }
}

function gravar(d: Dados): void {
  writeFileSync(arquivo(), JSON.stringify(d, null, 2), 'utf8')
}

export function listarProjetos(): Projeto[] {
  return ler().projetos.sort((a, b) => b.ultimoUso.localeCompare(a.ultimoUso))
}

export function tocarProjeto(caminho: string): Projeto {
  const d = ler()
  const projeto: Projeto = { caminho, nome: basename(caminho), ultimoUso: new Date().toISOString() }
  d.projetos = [projeto, ...d.projetos.filter((p) => p.caminho !== caminho)]
  gravar(d)
  return projeto
}

export function removerProjeto(caminho: string): Projeto[] {
  const d = ler()
  d.projetos = d.projetos.filter((p) => p.caminho !== caminho)
  gravar(d)
  return listarProjetos()
}

export function lerConfig(): Configuracao {
  return ler().config
}

export function salvarConfig(c: Configuracao): Configuracao {
  const d = ler()
  d.config = { ...CONFIG_PADRAO, ...c }
  gravar(d)
  return d.config
}

export function infoProjeto(caminho: string): InfoProjeto {
  const perfil = join(caminho, '.claude', 'orch', 'perfil.md')
  const temPerfil = existsSync(perfil)
  return {
    caminho,
    existe: existsSync(caminho),
    temPerfil,
    perfil: temPerfil ? readFileSync(perfil, 'utf8') : null
  }
}
