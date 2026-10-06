import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { OrchApi, Plano, Sessao } from '@shared/tipos'

function ouvir<A extends unknown[]>(canal: string, cb: (...args: A) => void): () => void {
  const h = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A))
  ipcRenderer.on(canal, h)
  return () => ipcRenderer.removeListener(canal, h)
}

const api: OrchApi = {
  projetos: {
    listar: () => ipcRenderer.invoke('projetos:listar'),
    escolher: () => ipcRenderer.invoke('projetos:escolher'),
    remover: (c) => ipcRenderer.invoke('projetos:remover', c),
    info: (c) => ipcRenderer.invoke('projetos:info', c)
  },
  planos: {
    observar: (p) => ipcRenderer.invoke('planos:observar', p),
    pararDeObservar: (p) => ipcRenderer.invoke('planos:parar', p),
    aoMudar: (cb) => ouvir<[string, Plano[]]>('planos:mudou', cb)
  },
  sessoes: {
    listar: () => ipcRenderer.invoke('sessoes:listar'),
    iniciar: (n) => ipcRenderer.invoke('sessoes:iniciar', n),
    enviar: (id, t) => ipcRenderer.invoke('sessoes:enviar', id, t),
    responder: (id, p, r) => ipcRenderer.invoke('sessoes:responder', id, p, r),
    interromper: (id) => ipcRenderer.invoke('sessoes:interromper', id),
    encerrar: (id) => ipcRenderer.invoke('sessoes:encerrar', id),
    descartar: (id) => ipcRenderer.invoke('sessoes:descartar', id),
    mudarModo: (id, m) => ipcRenderer.invoke('sessoes:mudarModo', id, m),
    continuar: (p, a) => ipcRenderer.invoke('sessoes:continuar', p, a),
    atualizarContexto: (id) => ipcRenderer.invoke('sessoes:contexto', id),
    aoMudar: (cb) => ouvir<[Sessao]>('sessoes:mudou', cb),
    aoAbrir: (cb) => ouvir<[string]>('sessoes:abrir', cb)
  },
  config: {
    ler: () => ipcRenderer.invoke('config:ler'),
    salvar: (c) => ipcRenderer.invoke('config:salvar', c),
    escolherPasta: () => ipcRenderer.invoke('config:escolherPasta'),
    definirTema: (t) => ipcRenderer.invoke('config:tema', t)
  },
  execucoes: {
    listar: (p) => ipcRenderer.invoke('execucoes:listar', p),
    ler: (p, a) => ipcRenderer.invoke('execucoes:ler', p, a),
    excluir: (p, a) => ipcRenderer.invoke('execucoes:excluir', p, a)
  },
  quadro: {
    ler: (p) => ipcRenderer.invoke('quadro:ler', p),
    salvar: (p, q) => ipcRenderer.invoke('quadro:salvar', p, q)
  },
  git: {
    status: (p) => ipcRenderer.invoke('git:status', p),
    diff: (p, c, prep) => ipcRenderer.invoke('git:diff', p, c, prep),
    preparar: (p, cs) => ipcRenderer.invoke('git:preparar', p, cs),
    tirarDaPreparacao: (p, cs) => ipcRenderer.invoke('git:tirarDaPreparacao', p, cs),
    descartar: (p, cs) => ipcRenderer.invoke('git:descartar', p, cs),
    commit: (p, m, t) => ipcRenderer.invoke('git:commit', p, m, t),
    buscar: (p) => ipcRenderer.invoke('git:buscar', p),
    pull: (p) => ipcRenderer.invoke('git:pull', p),
    push: (p) => ipcRenderer.invoke('git:push', p),
    branches: (p) => ipcRenderer.invoke('git:branches', p),
    trocarBranch: (p, n, r) => ipcRenderer.invoke('git:trocarBranch', p, n, r),
    criarBranch: (p, n, t) => ipcRenderer.invoke('git:criarBranch', p, n, t),
    apagarBranch: (p, n) => ipcRenderer.invoke('git:apagarBranch', p, n),
    log: (p) => ipcRenderer.invoke('git:log', p),
    iniciar: (p) => ipcRenderer.invoke('git:iniciar', p)
  },
  modelos: () => ipcRenderer.invoke('modelos'),
  login: {
    status: () => ipcRenderer.invoke('login:status'),
    abrir: () => ipcRenderer.invoke('login:abrir')
  },
  abrirNoTerminal: (n) => ipcRenderer.invoke('abrirNoTerminal', n),
  abrirArquivo: (c) => ipcRenderer.invoke('abrirArquivo', c)
}

contextBridge.exposeInMainWorld('orch', api)
