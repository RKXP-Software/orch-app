import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Configuracao, ModoPermissao, NovaSessao, OpcoesExecucao, PedidoTarefa, RespostaPendencia, Tema } from '@shared/tipos'
import {
  infoProjeto,
  lerConfig,
  listarProjetos,
  removerProjeto,
  salvarConfig,
  tocarProjeto
} from './armazenamento'
import { ObservadorPlanos } from './planos'
import { nomeBranchPlano } from '@shared/execucao'
import { ExecutorTarefas } from './tarefas'
import { atualizarPlugin, statusPlugin } from './plugin'
import { GerenciadorSessoes, listarModelos } from './sessoes'
import * as git from './git'
import { notificarPendencia } from './notificacoes'
import { lerQuadroDoProjeto, salvarQuadro } from './quadro'
import { excluirExecucao, lerExecucao, listarExecucoes } from './execucoes'
import type { Quadro } from '@shared/quadro'
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
const sessoes = new GerenciadorSessoes(
  (s) => enviar('sessoes:mudou', s),
  lerConfig,
  (s, p) => {
    if (lerConfig().notificacoes) notificarPendencia(janela, s, p, (id) => enviar('sessoes:abrir', id))
  },
  (s, fim) => tarefas.aoTerminar(s, fim)
)
const tarefas: ExecutorTarefas = new ExecutorTarefas(sessoes, lerConfig, (fila) => enviar('fila:mudou', fila))

function criarJanela(): void {
  janela = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: 'Orch',
    backgroundColor: nativeTheme.shouldUseDarkColors ? FUNDO.escuro : FUNDO.claro,
    autoHideMenuBar: true,
    // No app instalado o ícone vem do .exe; em desenvolvimento, do arquivo.
    ...(existsSync(join(app.getAppPath(), 'build', 'icon.png')) ? { icon: join(app.getAppPath(), 'build', 'icon.png') } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  janela.on('focus', () => janela?.flashFrame(false))

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

  ipcMain.handle('planos:observar', (_e, projeto: string) => {
    tarefas.recuperarOrfas(projeto)
    return planos.observar(projeto)
  })
  ipcMain.handle('planos:executarTarefas', (_e, p: string, plano: string, pedidos: PedidoTarefa[], o: OpcoesExecucao) =>
    tarefas.executar(p, plano, pedidos, o)
  )
  ipcMain.handle('planos:pularTarefa', (_e, p: string, plano: string, t: string) => tarefas.pular(p, plano, t))
  ipcMain.handle('planos:mesclarTarefa', (_e, p: string, plano: string, t: string) => tarefas.mesclar(p, plano, t))
  ipcMain.handle('planos:prepararBranch', async (_e, p: string, plano: string) => {
    const r = await git.garantirBranch(p, nomeBranchPlano(plano))
    if (!r.ok) throw new Error(`Não foi possível usar o branch do plano: ${r.saida}`)
  })
  ipcMain.handle('planos:fila', () => tarefas.listarFila())
  ipcMain.handle('planos:cancelarNaFila', (_e, p: string, plano: string, t: string) => tarefas.cancelarNaFila(p, plano, t))
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
  ipcMain.handle('sessoes:mudarModo', (_e, id: string, modo: ModoPermissao) => sessoes.mudarModo(id, modo))
  ipcMain.handle('sessoes:contexto', (_e, id: string) => sessoes.atualizarContexto(id, 'full'))

  ipcMain.handle('config:ler', () => lerConfig())
  ipcMain.handle('config:salvar', (_e, c: Configuracao) => {
    const salva = salvarConfig(c)
    aplicarTema(salva.tema)
    // Limite aumentado: tarefas da fila podem começar agora.
    tarefas.bombear()
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

  ipcMain.handle('execucoes:listar', (_e, p: string) => listarExecucoes(p, sessoes.listar()))
  ipcMain.handle('execucoes:ler', (_e, p: string, a: string) => lerExecucao(p, a))
  ipcMain.handle('execucoes:excluir', (_e, p: string, a: string) => excluirExecucao(p, a))
  ipcMain.handle('sessoes:continuar', (_e, p: string, a: string) => sessoes.continuar(p, a))
  ipcMain.handle('quadro:ler', (_e, p: string) => lerQuadroDoProjeto(p))
  ipcMain.handle('quadro:salvar', (_e, p: string, q: Quadro) => salvarQuadro(p, q))
  ipcMain.handle('git:status', (_e, p: string) => git.status(p))
  ipcMain.handle('git:diff', (_e, p: string, c: string, prep: boolean) => git.diff(p, c, prep))
  ipcMain.handle('git:preparar', (_e, p: string, cs: string[]) => git.preparar(p, cs))
  ipcMain.handle('git:tirarDaPreparacao', (_e, p: string, cs: string[]) => git.tirarDaPreparacao(p, cs))
  ipcMain.handle('git:descartar', (_e, p: string, cs: string[]) => git.descartar(p, cs))
  ipcMain.handle('git:commit', (_e, p: string, m: string, todos: boolean) => git.commit(p, m, todos))
  ipcMain.handle('git:buscar', (_e, p: string) => git.buscar(p))
  ipcMain.handle('git:pull', (_e, p: string) => git.pull(p))
  ipcMain.handle('git:push', (_e, p: string) => git.push(p))
  ipcMain.handle('git:branches', (_e, p: string) => git.branches(p))
  ipcMain.handle('git:trocarBranch', (_e, p: string, n: string, r: boolean) => git.trocarBranch(p, n, r))
  ipcMain.handle('git:criarBranch', (_e, p: string, n: string, t: boolean) => git.criarBranch(p, n, t))
  ipcMain.handle('git:apagarBranch', (_e, p: string, n: string) => git.apagarBranch(p, n))
  ipcMain.handle('git:log', (_e, p: string) => git.log(p))
  ipcMain.handle('git:iniciar', (_e, p: string) => git.iniciarRepo(p))

  ipcMain.handle('plugin:status', () => statusPlugin(lerConfig()))
  ipcMain.handle('plugin:atualizar', () => atualizarPlugin(lerConfig()))
  ipcMain.handle('modelos', () => listarModelos(lerConfig()))
  ipcMain.handle('login:status', () => statusLogin(lerConfig()))
  ipcMain.handle('login:abrir', () => abrirLogin(lerConfig()))
  ipcMain.handle('abrirNoTerminal', (_e, nova: NovaSessao) => abrirNoTerminal(nova, lerConfig()))

  ipcMain.handle('abrirArquivo', async (_e, caminho: string) => {
    const erro = await shell.openPath(caminho)
    if (erro) throw new Error(erro)
  })
}

// Sem isso, as notificações do Windows não aparecem com o nome do app.
app.setAppUserModelId('br.com.rkxp.orch')

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
