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
    aoMudar: (cb) => ouvir<[Sessao]>('sessoes:mudou', cb)
  },
  config: {
    ler: () => ipcRenderer.invoke('config:ler'),
    salvar: (c) => ipcRenderer.invoke('config:salvar', c),
    escolherPasta: () => ipcRenderer.invoke('config:escolherPasta'),
    definirTema: (t) => ipcRenderer.invoke('config:tema', t)
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
