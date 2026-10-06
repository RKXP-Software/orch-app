// Leitura dos planos do orch: o .json (plugin ≥ 0.4.0) é o formato principal;
// o .md é lido como fallback para planos criados por versões anteriores.

import type { EventoPlano, Plano, StatusPlano, StatusTarefa, Tarefa } from './tipos'

const STATUS_PLANO: StatusPlano[] = ['planejado', 'em-execucao', 'concluido', 'parcial', 'cancelado']
const STATUS_TAREFA: StatusTarefa[] = ['pendente', 'em-andamento', 'concluida', 'falhou', 'pulada']

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalizarStatus<T extends string>(valor: unknown, validos: T[], padrao: T): T {
  if (typeof valor !== 'string') return padrao
  const v = semAcento(valor.trim().toLowerCase()).replace(/\s+/g, '-')
  return (validos as string[]).includes(v) ? (v as T) : padrao
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function lista(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** Ondas por ordenação topológica: onda N = tarefas cujas dependências estão todas em ondas anteriores. */
export function calcularOndas(tarefas: Pick<Tarefa, 'id' | 'dependeDe'>[]): string[][] {
  const ids = new Set(tarefas.map((t) => t.id))
  const nivel = new Map<string, number>()
  const visitando = new Set<string>()

  const calcular = (id: string): number => {
    const conhecido = nivel.get(id)
    if (conhecido !== undefined) return conhecido
    if (visitando.has(id)) return 0 // ciclo: não deveria existir, mas não trava a tela
    visitando.add(id)
    const t = tarefas.find((x) => x.id === id)
    const deps = (t?.dependeDe ?? []).filter((d) => ids.has(d))
    const n = deps.length === 0 ? 0 : Math.max(...deps.map(calcular)) + 1
    visitando.delete(id)
    nivel.set(id, n)
    return n
  }

  const ondas: string[][] = []
  for (const t of tarefas) {
    const n = calcular(t.id)
    ;(ondas[n] ??= []).push(t.id)
  }
  return ondas.filter(Boolean)
}

export function progresso(plano: Pick<Plano, 'tarefas'>): { feitas: number; total: number; pct: number } {
  const total = plano.tarefas.length
  const feitas = plano.tarefas.filter((t) => t.status === 'concluida' || t.status === 'pulada').length
  return { feitas, total, pct: total === 0 ? 0 : Math.round((feitas / total) * 100) }
}

/** Tarefas prontas para rodar: pendentes com todas as dependências concluídas. */
export function tarefasProntas(plano: Pick<Plano, 'tarefas'>): string[] {
  const status = new Map(plano.tarefas.map((t) => [t.id, t.status]))
  return plano.tarefas
    .filter((t) => t.status === 'pendente' && t.dependeDe.every((d) => status.get(d) === 'concluida'))
    .map((t) => t.id)
}

export function planoDoJson(bruto: unknown, arquivoMd: string | null = null): Plano {
  if (!bruto || typeof bruto !== 'object') throw new Error('Plano JSON inválido')
  const o = bruto as Record<string, unknown>
  if (typeof o.schema === 'string' && !o.schema.startsWith('orch.plano/')) {
    throw new Error(`Schema desconhecido: ${o.schema}`)
  }
  const id = texto(o.id)
  if (!id) throw new Error('Plano JSON sem id')

  const tarefas: Tarefa[] = (Array.isArray(o.tarefas) ? o.tarefas : []).map((x, i) => {
    const t = (x ?? {}) as Record<string, unknown>
    return {
      id: texto(t.id) ?? `T${i + 1}`,
      titulo: texto(t.titulo) ?? '',
      executor: texto(t.executor) ?? '',
      dependeDe: lista(t.dependeDe),
      arquivos: lista(t.arquivos),
      prontoQuando: texto(t.prontoQuando),
      status: normalizarStatus(t.status, STATUS_TAREFA, 'pendente'),
      inicio: texto(t.inicio),
      fim: texto(t.fim),
      tentativas: typeof t.tentativas === 'number' ? t.tentativas : 0,
      resultado: texto(t.resultado)
    }
  })

  const eventos: EventoPlano[] = (Array.isArray(o.eventos) ? o.eventos : []).map((x) => {
    const e = (x ?? {}) as Record<string, unknown>
    return {
      quando: texto(e.quando) ?? '',
      tarefa: texto(e.tarefa),
      tipo: texto(e.tipo) ?? 'evento',
      texto: texto(e.texto) ?? ''
    }
  })

  const ondasJson = Array.isArray(o.ondas) ? o.ondas.map(lista).filter((w) => w.length > 0) : []

  return {
    id,
    titulo: texto(o.titulo) ?? id,
    status: normalizarStatus(o.status, STATUS_PLANO, 'planejado'),
    demanda: texto(o.demanda) ?? '',
    objetivo: texto(o.objetivo),
    grupo: texto(o.grupo),
    dependeDosPlanos: lista(o.dependeDosPlanos),
    criado: texto(o.criado),
    atualizado: texto(o.atualizado),
    commitInicial: texto(o.commitInicial),
    versaoOrch: texto(o.versaoOrch),
    ondas: ondasJson.length > 0 ? ondasJson : calcularOndas(tarefas),
    tarefas,
    eventos,
    resultadoFinal: texto(o.resultadoFinal),
    origem: 'json',
    arquivoMd
  }
}

// ---------- Fallback: leitura do .md ----------

function celulas(linha: string): string[] {
  return linha
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

function semCrase(s: string): string {
  return s.replace(/`/g, '').trim()
}

function vazio(s: string): boolean {
  return s === '' || /^[—–-]/.test(s)
}

/** Linhas de uma seção "## Título" até a próxima "## ". */
function secao(linhas: string[], titulo: RegExp): string[] {
  const ini = linhas.findIndex((l) => /^##\s/.test(l) && titulo.test(l))
  if (ini < 0) return []
  const resto = linhas.slice(ini + 1)
  const fim = resto.findIndex((l) => /^##\s/.test(l))
  return fim < 0 ? resto : resto.slice(0, fim)
}

function linhasDeTabela(linhas: string[]): string[][] {
  return linhas
    .filter((l) => l.trim().startsWith('|'))
    .slice(2) // cabeçalho + separador
    .map(celulas)
}

export function planoDoMd(conteudo: string, arquivoMd: string): Plano {
  const linhas = conteudo.replace(/\r\n/g, '\n').split('\n')

  const meta: Record<string, string> = {}
  const cab = conteudo.match(/<!--\s*orch:plano(.*?)-->/s)
  if (cab) {
    for (const parte of cab[1].split('·')) {
      const m = parte.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/s)
      if (m) meta[m[1]] = m[2]
    }
  }

  const nomeArquivo = arquivoMd.split(/[\\/]/).pop()!.replace(/\.md$/i, '')
  const id = meta.id ?? nomeArquivo
  const titulo = linhas.find((l) => /^#\s/.test(l))?.replace(/^#\s+/, '').trim() ?? id
  const demanda = conteudo.match(/\*\*Demanda original:\*\*\s*(.+)/)?.[1].trim() ?? ''
  const objetivo = secao(linhas, /Objetivo/).join('\n').trim() || null

  const resultados = new Map<string, string>()
  let tarefaAtual: string | null = null
  for (const l of linhas) {
    const h = l.match(/^###\s+(T\d+)\b/)
    if (h) tarefaAtual = h[1]
    const r = l.match(/^\s*-\s*\*\*Resultado:\*\*\s*(.+)/)
    if (r && tarefaAtual && !/^\{.*\}$/.test(r[1].trim())) resultados.set(tarefaAtual, r[1].trim())
  }

  const tarefas: Tarefa[] = linhasDeTabela(secao(linhas, /Tarefas/))
    .filter((c) => /^T\d+/.test(c[0] ?? ''))
    .map((c) => ({
      id: c[0],
      titulo: c[1] ?? '',
      executor: semCrase(c[2] ?? ''),
      dependeDe: vazio(c[3] ?? '') ? [] : (c[3].match(/T\d+/g) ?? []),
      arquivos: vazio(semCrase(c[4] ?? ''))
        ? []
        : semCrase(c[4]).split(/[,;]/).map((s) => s.trim()).filter(Boolean),
      prontoQuando: null,
      status: normalizarStatus(c[5], STATUS_TAREFA, 'pendente'),
      inicio: null,
      fim: null,
      tentativas: 0,
      resultado: resultados.get(c[0]) ?? null
    }))

  const eventos: EventoPlano[] = linhasDeTabela(secao(linhas, /Registro de execu/))
    .filter((c) => c.length >= 2 && !/^\{/.test(c[0]))
    .map((c) => ({ quando: c[0], tarefa: c[1].match(/\bT\d+\b/)?.[0] ?? null, tipo: 'evento', texto: c[1] }))

  const final = secao(linhas, /Resultado final/).join('\n').trim()

  return {
    id,
    titulo,
    status: normalizarStatus(meta.status, STATUS_PLANO, 'planejado'),
    demanda,
    objetivo,
    grupo: null,
    dependeDosPlanos: [],
    criado: meta.criado ?? null,
    atualizado: null,
    commitInicial: meta['commit-inicial'] ?? null,
    versaoOrch: meta['versao-orch'] ?? null,
    ondas: calcularOndas(tarefas),
    tarefas,
    eventos,
    resultadoFinal: final && !/^\{.*\}$/s.test(final) ? final : null,
    origem: 'md',
    arquivoMd
  }
}

/** Mais recentes primeiro (o id começa com AAAAMMDD-HHMM). */
export function ordenarPlanos(planos: Plano[]): Plano[] {
  return [...planos].sort((a, b) => b.id.localeCompare(a.id))
}
