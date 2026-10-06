import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import type { Configuracao, NovaSessao, RespostaPendencia, Tema } from '@shared/tipos'
import {
  infoProjeto,
  lerConfig,
  listarProjetos,
  removerProjeto,
  salvarConfig,
  tocarProjeto
} from './armazenamento'
import { ObservadorPlanos } from './planos'
import { GerenciadorSessoes, listarModelos } from './sessoes'
import { abrirLogin, abrirNoTerminal, statusLogin } from './terminal'

let janela: BrowserWindow | null = null

const FUNDO = { claro: '#f6f7f9', escuro: '#14161a' }

/** O prefers-color-scheme do Chromium segue o nativeTheme: o CSS e a barra de título mudam juntos. */
function aplicarTema(tema: Tema): void {
  nativeTheme.themeSource = tema === 'claro' ? 'light' : tema === 'escuro' ? 'dark' : 'system'
  janela?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? FUNDO.escuro : FUNDO.claro)
}

const enviar = (canal: string, ...args: unknown[]) => {
  if (janela && !janela.isDestroyed()) janela.webContents.send(canal, ...args)
}

const planos = new ObservadorPlanos((projeto, lista) => enviar('planos:mudou', projeto, lista))
const sessoes = new GerenciadorSessoes((s) => enviar('sessoes:mudou', s), lerConfig)

function criarJanela(): void {
  janela = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: 'Orch',
    backgroundColor: nativeTheme.shouldUseDarkColors ? FUNDO.escuro : FUNDO.claro,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Links externos abrem no navegador, nunca dentro do app.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void janela.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void janela.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registrarIpc(): void {
  ipcMain.handle('projetos:listar', () => listarProjetos())
  ipcMain.handle('projetos:escolher', async () => {
    const r = await dialog.showOpenDialog(janela!, {
      title: 'Escolha a pasta do projeto',
      properties: ['openDirectory']
    })
    return r.canceled || !r.filePaths[0] ? null : tocarProjeto(r.filePaths[0])
  })
  ipcMain.handle('projetos:remover', (_e, caminho: string) => removerProjeto(caminho))
  ipcMain.handle('projetos:info', (_e, caminho: string) => {
    tocarProjeto(caminho)
    return infoProjeto(caminho)
  })

  ipcMain.handle('planos:observar', (_e, projeto: string) => planos.observar(projeto))
  ipcMain.handle('planos:parar', (_e, projeto: string) => planos.parar(projeto))

  ipcMain.handle('sessoes:listar', () => sessoes.listar())
  ipcMain.handle('sessoes:iniciar', (_e, nova: NovaSessao) => sessoes.iniciar(nova))
  ipcMain.handle('sessoes:enviar', (_e, id: string, texto: string) => sessoes.enviar(id, texto))
  ipcMain.handle('sessoes:responder', (_e, id: string, pendencia: string, r: RespostaPendencia) =>
    sessoes.responder(id, pendencia, r)
  )
  ipcMain.handle('sessoes:interromper', (_e, id: string) => sessoes.interromper(id))
  ipcMain.handle('sessoes:encerrar', (_e, id: string) => sessoes.encerrar(id))
  ipcMain.handle('sessoes:descartar', (_e, id: string) => sessoes.descartar(id))

  ipcMain.handle('config:ler', () => lerConfig())
  ipcMain.handle('config:salvar', (_e, c: Configuracao) => {
    const salva = salvarConfig(c)
    aplicarTema(salva.tema)
    return salva
  })
  ipcMain.handle('config:tema', (_e, tema: Tema) => {
    const salva = salvarConfig({ ...lerConfig(), tema })
    aplicarTema(salva.tema)
    return salva
  })
  ipcMain.handle('config:escolherPasta', async () => {
    const r = await dialog.showOpenDialog(janela!, { properties: ['openDirectory'] })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })

  ipcMain.handle('modelos', () => listarModelos(lerConfig()))
  ipcMain.handle('login:status', () => statusLogin(lerConfig()))
  ipcMain.handle('login:abrir', () => abrirLogin(lerConfig()))
  ipcMain.handle('abrirNoTerminal', (_e, nova: NovaSessao) => abrirNoTerminal(nova, lerConfig()))

  ipcMain.handle('abrirArquivo', async (_e, caminho: string) => {
    const erro = await shell.openPath(caminho)
    if (erro) throw new Error(erro)
  })
}

app.whenReady().then(() => {
  aplicarTema(lerConfig().tema)
  registrarIpc()
  criarJanela()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela()
  })
})

app.on('window-all-closed', () => {
  sessoes.encerrarTodas()
  void planos.pararTodos()
  if (process.platform !== 'darwin') app.quit()
})
