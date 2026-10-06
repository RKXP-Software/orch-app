// Leitura da saída do git em formatos estáveis (porcelain v2, for-each-ref, log com separadores).

export type EstadoArquivo =
  | 'modificado'
  | 'adicionado'
  | 'removido'
  | 'renomeado'
  | 'copiado'
  | 'tipo-alterado'
  | 'conflito'
  | 'nao-rastreado'

export interface ArquivoAlterado {
  caminho: string
  /** Caminho anterior, em renomeações e cópias. */
  origem: string | null
  /** Estado na área de preparação (staged); null = nada preparado. */
  indice: EstadoArquivo | null
  /** Estado na pasta de trabalho (ainda não preparado); null = sem mudanças fora da preparação. */
  arvore: EstadoArquivo | null
}

export interface StatusGit {
  repo: boolean
  branch: string | null
  /** true quando HEAD não aponta para um branch. */
  destacado: boolean
  upstream: string | null
  aFrente: number
  atras: number
  semCommits: boolean
  arquivos: ArquivoAlterado[]
}

export interface Branch {
  nome: string
  atual: boolean
  remota: boolean
  upstream: string | null
  /** Ex.: "[ahead 1, behind 2]" ou "[gone]". */
  rastreio: string
  data: string
  assunto: string
}

export interface Commit {
  hash: string
  curto: string
  autor: string
  data: string
  assunto: string
}

export interface ResultadoGit {
  ok: boolean
  saida: string
}

const LETRA: Record<string, EstadoArquivo> = {
  M: 'modificado',
  A: 'adicionado',
  D: 'removido',
  R: 'renomeado',
  C: 'copiado',
  T: 'tipo-alterado',
  U: 'conflito'
}

const estado = (c: string): EstadoArquivo | null => LETRA[c] ?? null

/** Campos separados por espaço, com o caminho (que pode ter espaços) depois de `n` campos. */
function campos(registro: string, n: number): { partes: string[]; caminho: string } {
  const partes: string[] = []
  let resto = registro
  for (let k = 0; k < n; k++) {
    const i = resto.indexOf(' ')
    partes.push(resto.slice(0, i))
    resto = resto.slice(i + 1)
  }
  return { partes, caminho: resto }
}

/** Saída de `git status --porcelain=v2 --branch -z`. */
export function lerStatus(saida: string): StatusGit {
  const st: StatusGit = {
    repo: true,
    branch: null,
    destacado: false,
    upstream: null,
    aFrente: 0,
    atras: 0,
    semCommits: false,
    arquivos: []
  }
  const regs = saida.split('\0')
  for (let i = 0; i < regs.length; i++) {
    const r = regs[i]
    if (!r) continue
    if (r.startsWith('# branch.oid ')) {
      st.semCommits = r.endsWith('(initial)')
    } else if (r.startsWith('# branch.head ')) {
      const h = r.slice('# branch.head '.length)
      st.destacado = h === '(detached)'
      st.branch = st.destacado ? null : h
    } else if (r.startsWith('# branch.upstream ')) {
      st.upstream = r.slice('# branch.upstream '.length)
    } else if (r.startsWith('# branch.ab ')) {
      const m = r.match(/\+(\d+) -(\d+)/)
      if (m) {
        st.aFrente = Number(m[1])
        st.atras = Number(m[2])
      }
    } else if (r.startsWith('1 ')) {
      const { partes, caminho } = campos(r, 8)
      st.arquivos.push({ caminho, origem: null, indice: estado(partes[1][0]), arvore: estado(partes[1][1]) })
    } else if (r.startsWith('2 ')) {
      const { partes, caminho } = campos(r, 9)
      const origem = regs[++i] ?? null // no -z, o caminho original vem no registro seguinte
      st.arquivos.push({ caminho, origem, indice: estado(partes[1][0]), arvore: estado(partes[1][1]) })
    } else if (r.startsWith('u ')) {
      const { caminho } = campos(r, 10)
      st.arquivos.push({ caminho, origem: null, indice: 'conflito', arvore: 'conflito' })
    } else if (r.startsWith('? ')) {
      st.arquivos.push({ caminho: r.slice(2), origem: null, indice: null, arvore: 'nao-rastreado' })
    }
  }
  st.arquivos.sort((a, b) => a.caminho.localeCompare(b.caminho))
  return st
}

/** Formato usado em `git for-each-ref` (campos separados por %00, um ref por linha). */
export const FORMATO_BRANCH = '%(HEAD)%00%(refname)%00%(refname:short)%00%(upstream:short)%00%(upstream:track)%00%(committerdate:iso-strict)%00%(subject)'

export function lerBranches(saida: string): Branch[] {
  return saida
    .split('\n')
    .filter((l) => l.includes('\0'))
    .map((l) => l.split('\0'))
    // Ignora origin/HEAD (e o alias "refs/remotes/origin", sem nome de branch).
    .filter(([, ref]) => !ref.endsWith('/HEAD') && !(ref.startsWith('refs/remotes/') && ref.split('/').length < 4))
    .map(([head, ref, nome, upstream, rastreio, data, assunto]) => ({
      nome,
      atual: head === '*',
      remota: ref.startsWith('refs/remotes/'),
      upstream: upstream || null,
      rastreio: rastreio ?? '',
      data: data ?? '',
      assunto: assunto ?? ''
    }))
}

/** Formato usado em `git log` (campos separados por %x00, commits por %x1e). */
export const FORMATO_LOG = '%H%x00%h%x00%an%x00%aI%x00%s%x1e'

export function lerLog(saida: string): Commit[] {
  return saida
    .split('\x1e')
    .map((c) => c.replace(/^\s+/, ''))
    .filter(Boolean)
    .map((c) => {
      const [hash, curto, autor, data, assunto] = c.split('\0')
      return { hash, curto, autor, data, assunto: assunto ?? '' }
    })
}

export type TipoLinhaDiff = 'adicionada' | 'removida' | 'contexto' | 'trecho' | 'cabecalho' | 'aviso'

export interface LinhaDiff {
  tipo: TipoLinhaDiff
  texto: string
  antiga: number | null
  nova: number | null
}

/** Diff unificado → linhas com numeração da versão antiga e da nova. */
export function lerDiff(diff: string): LinhaDiff[] {
  const linhas: LinhaDiff[] = []
  let antiga = 0
  let nova = 0
  let noTrecho = false
  for (const l of diff.replace(/\r\n/g, '\n').split('\n')) {
    const h = l.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (h) {
      antiga = Number(h[1])
      nova = Number(h[2])
      noTrecho = true
      linhas.push({ tipo: 'trecho', texto: l, antiga: null, nova: null })
    } else if (!noTrecho) {
      if (l.startsWith('Binary files')) linhas.push({ tipo: 'aviso', texto: 'Arquivo binário: o conteúdo não é exibido.', antiga: null, nova: null })
      else if (l) linhas.push({ tipo: 'cabecalho', texto: l, antiga: null, nova: null })
    } else if (l.startsWith('+')) {
      linhas.push({ tipo: 'adicionada', texto: l.slice(1), antiga: null, nova: nova++ })
    } else if (l.startsWith('-')) {
      linhas.push({ tipo: 'removida', texto: l.slice(1), antiga: antiga++, nova: null })
    } else if (l.startsWith('\\')) {
      linhas.push({ tipo: 'aviso', texto: l.slice(2), antiga: null, nova: null })
    } else if (l.startsWith('diff --git')) {
      noTrecho = false
      linhas.push({ tipo: 'cabecalho', texto: l, antiga: null, nova: null })
    } else if (l !== '' || linhas.length === 0) {
      linhas.push({ tipo: 'contexto', texto: l.slice(1), antiga: antiga++, nova: nova++ })
    }
  }
  return linhas
}

/** Conteúdo de um arquivo novo (não rastreado) como diff de linhas adicionadas. */
export function diffDeArquivoNovo(conteudo: string): LinhaDiff[] {
  const ls = conteudo.replace(/\r\n/g, '\n').split('\n')
  if (ls.length > 1 && ls[ls.length - 1] === '') ls.pop()
  return [
    { tipo: 'trecho', texto: `Arquivo novo · ${ls.length} linha(s)`, antiga: null, nova: null },
    ...ls.map((texto, i) => ({ tipo: 'adicionada' as const, texto, antiga: null, nova: i + 1 }))
  ]
}
