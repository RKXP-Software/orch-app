import { useCallback, useEffect, useState } from 'react'
import type { InfoProjeto, ItemFila, NovaSessao, Plano, Projeto, Sessao, StatusLogin, Tema } from '@shared/tipos'
import { promptPlano } from '@shared/execucao'
import icone from './assets/icone.svg'
import { Alteracoes } from './componentes/Alteracoes'
import { AtalhoAtualizarPlugin } from './componentes/AtualizarPlugin'
import { Configuracoes } from './componentes/Configuracoes'
import { Dashboard } from './componentes/Dashboard'
import { Execucoes } from './componentes/Execucoes'
import { Git } from './componentes/Git'
import { Inicio } from './componentes/Inicio'
import { NovaExecucao } from './componentes/NovaExecucao'
import { Paralelo } from './componentes/Paralelo'
import { DetalhePlano, ListaPlanos } from './componentes/Planos'
import { TelaSessao } from './componentes/Sessao'
import { Selo } from './componentes/Selo'
import { nomeModelo } from '@shared/modelos'
import { nomePasta, ROTULO_SESSAO } from './util'

type Aba = 'planos' | 'execucoes' | 'paralelo' | 'alteracoes' | 'git' | 'nova'

const ATIVAS = ['iniciando', 'executando', 'aguardando-voce', 'ociosa']

type Vista =
  | { tipo: 'inicio' }
  | { tipo: 'projeto'; caminho: string; aba: Aba; plano?: string }
  | { tipo: 'sessao'; id: string }
  | { tipo: 'config' }
  | { tipo: 'dashboard' }
  | { tipo: 'execucao'; projeto: string; arquivo: string }

export function App() {
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [info, setInfo] = useState<InfoProjeto | null>(null)
  const [planos, setPlanos] = useState<Record<string, Plano[]>>({})
  const [sessoes, setSessoes] = useState<Record<string, Sessao>>({})
  const [vista, setVista] = useState<Vista>({ tipo: 'inicio' })
  const [login, setLogin] = useState<StatusLogin | null>(null)
  const [fila, setFila] = useState<ItemFila[]>([])
  /** Execução gravada aberta do arquivo (sem processo vivo). */
  const [gravada, setGravada] = useState<Sessao | null>(null)

  useEffect(() => {
    if (vista.tipo !== 'execucao') return
    setGravada(null)
    void window.orch.execucoes.ler(vista.projeto, vista.arquivo).then(setGravada)
  }, [vista])
  const [tema, setTema] = useState<Tema>('sistema')

  useEffect(() => {
    void window.orch.config.ler().then((c) => setTema(c.tema))
  }, [])

  const mudarTema = async (t: Tema) => {
    setTema(t)
    await window.orch.config.definirTema(t)
  }

  const verificarLogin = useCallback(() => {
    void window.orch.login.status().then(setLogin)
  }, [])

  useEffect(() => {
    verificarLogin()
    // Ao voltar do terminal de login, confere de novo.
    window.addEventListener('focus', verificarLogin)
    return () => window.removeEventListener('focus', verificarLogin)
  }, [verificarLogin])

  useEffect(() => {
    void window.orch.projetos.listar().then((lista) => {
      setProjetos(lista)
      // Com projetos já mapeados, o app abre no Dashboard; o tutorial fica no logo "Orch".
      if (lista.length > 0) setVista((v) => (v.tipo === 'inicio' ? { tipo: 'dashboard' } : v))
    })
    void window.orch.sessoes.listar().then((l) => setSessoes(Object.fromEntries(l.map((s) => [s.id, s]))))
    const a = window.orch.planos.aoMudar((projeto, lista) => setPlanos((p) => ({ ...p, [projeto]: lista })))
    const b = window.orch.sessoes.aoMudar((s) => setSessoes((atual) => ({ ...atual, [s.id]: { ...s } })))
    const c = window.orch.sessoes.aoAbrir((id) => setVista({ tipo: 'sessao', id }))
    void window.orch.planos.fila().then(setFila)
    const d = window.orch.planos.aoMudarFila(setFila)
    return () => {
      a()
      b()
      c()
      d()
    }
  }, [])

  const observar = useCallback(async (caminho: string) => {
    const lista = await window.orch.planos.observar(caminho)
    setPlanos((p) => ({ ...p, [caminho]: lista }))
  }, [])

  const abrirProjeto = useCallback(
    async (caminho: string, aba: Aba = 'planos', plano?: string) => {
      setVista({ tipo: 'projeto', caminho, aba, plano })
      setInfo(await window.orch.projetos.info(caminho))
      await observar(caminho)
    },
    [observar]
  )

  const adicionarProjeto = async () => {
    const p = await window.orch.projetos.escolher()
    if (!p) return
    setProjetos(await window.orch.projetos.listar())
    await abrirProjeto(p.caminho)
  }

  /** Inicia uma execução. Com `ficar`, continua na tela atual (ex.: o quadro). */
  const iniciar = async (nova: NovaSessao, onde: 'app' | 'terminal' = 'app', ficar = false): Promise<Sessao | null> => {
    if (onde === 'terminal') {
      await window.orch.abrirNoTerminal(nova)
      if (!ficar) setVista({ tipo: 'projeto', caminho: nova.projeto, aba: 'planos' })
      await observar(nova.projeto)
      return null
    }
    const s = await window.orch.sessoes.iniciar(nova)
    setSessoes((atual) => ({ ...atual, [s.id]: s }))
    if (!ficar) setVista({ tipo: 'sessao', id: s.id })
    await observar(nova.projeto)
    return s
  }

  const listaSessoes = Object.values(sessoes).sort((a, b) => b.iniciada.localeCompare(a.iniciada))
  const ocupadoNo = (projeto: string) =>
    listaSessoes.some((s) => s.projeto === projeto && ['iniciando', 'executando', 'aguardando-voce'].includes(s.status))

  return (
    <div className="app">
      <aside className="lateral">
        <div className="lateral-topo">
          <button className="marca" onClick={() => setVista({ tipo: 'inicio' })} title="Início e tutorial">
            <img src={icone} alt="" width={26} height={26} />
            Orch
          </button>
        </div>
        <div className="lateral-rolagem">
          <button
            className={`item ${vista.tipo === 'dashboard' ? 'ativo' : ''}`}
            style={{ marginTop: 4 }}
            onClick={() => setVista({ tipo: 'dashboard' })}
          >
            <span className="nome">Dashboard</span>
            {listaSessoes.some((s) => s.status === 'aguardando-voce') && <span className="ponto acento" title="Execução aguardando você" />}
          </button>
          <div className="lateral-secao">
            <span>Projetos</span>
            <button className="botao icone" title="Adicionar projeto" onClick={adicionarProjeto}>
              +
            </button>
          </div>
          {projetos.length === 0 && <div className="muted" style={{ padding: '0 8px', fontSize: 12 }}>Nenhum projeto.</div>}
          {projetos.map((p) => (
            <button
              key={p.caminho}
              className={`item ${vista.tipo === 'projeto' && vista.caminho === p.caminho ? 'ativo' : ''}`}
              title={p.caminho}
              onClick={() => void abrirProjeto(p.caminho)}
            >
              <span className="nome">{p.nome}</span>
              {ocupadoNo(p.caminho) && <span className="ponto andamento" />}
            </button>
          ))}

          {listaSessoes.length > 0 && (
            <div className="lateral-secao">
              <span>Execuções</span>
            </div>
          )}
          {listaSessoes.map((s) => {
            const [rotulo, tom] = ROTULO_SESSAO[s.status]
            return (
              <button
                key={s.id}
                className={`item ${vista.tipo === 'sessao' && vista.id === s.id ? 'ativo' : ''}`}
                onClick={() => {
                  setVista({ tipo: 'sessao', id: s.id })
                  void observar(s.projeto)
                }}
              >
                <span className={`ponto ${tom}`} title={rotulo} />
                <span className="nome">
                  {s.titulo}
                  <div className="sub">{nomePasta(s.projeto)}</div>
                </span>
              </button>
            )
          })}
        </div>
        <div className="lateral-rodape">
          <div className="seletor-tema" role="radiogroup" aria-label="Tema">
            {(
              [
                ['sistema', 'Sistema'],
                ['claro', 'Claro'],
                ['escuro', 'Escuro']
              ] as [Tema, string][]
            ).map(([t, nome]) => (
              <button
                key={t}
                role="radio"
                aria-checked={tema === t}
                className={tema === t ? 'ativo' : ''}
                onClick={() => void mudarTema(t)}
              >
                {nome}
              </button>
            ))}
          </div>
          <AtalhoAtualizarPlugin />
          <button className={`item ${vista.tipo === 'config' ? 'ativo' : ''}`} onClick={() => setVista({ tipo: 'config' })}>
            <span className="nome">Configurações</span>
          </button>
        </div>
      </aside>

      <main className="principal">
        {login && !login.logado && (
          <div className="faixa-login">
            <span>
              {login.erro
                ? `Não foi possível consultar o Claude Code: ${login.erro}`
                : 'O Claude Code não está logado nesta máquina. As execuções precisam do login da sua conta Claude.'}
            </span>
            <span className="espaco" />
            <button className="botao pequeno primario" onClick={() => void window.orch.login.abrir()}>
              Fazer login
            </button>
            <button className="botao pequeno" onClick={verificarLogin}>
              Verificar de novo
            </button>
          </div>
        )}
        {renderizar()}
      </main>
    </div>
  )

  function renderizar() {
    if (vista.tipo === 'execucao') {
      if (!gravada) return <div className="vazio">Lendo a execução…</div>
      const s = gravada
      return (
        <>
          <header className="cabecalho">
            <div style={{ minWidth: 0 }}>
              <h1>{s.titulo}</h1>
              <div className="caminho mono">
                {nomePasta(s.projeto)} · .claude/orch/execucoes/{s.arquivo}
              </div>
            </div>
            <div className="abas">
              <span className="selo acento" title={s.modelo || undefined}>
                {nomeModelo(s.modelo)}
              </span>
              <Selo rotulo={ROTULO_SESSAO[s.status]} />
            </div>
          </header>
          <div style={{ flex: 1, minHeight: 0 }}>
            <TelaSessao
              sessao={s}
              planos={planos[s.projeto] ?? []}
              aoAbrirPlano={(id) => void abrirProjeto(s.projeto, 'planos', id)}
              aoDescartar={() => void abrirProjeto(s.projeto, 'execucoes')}
              aoContinuar={async () => {
                try {
                  const viva = await window.orch.sessoes.continuar(vista.projeto, vista.arquivo)
                  setSessoes((atual) => ({ ...atual, [viva.id]: viva }))
                  setVista({ tipo: 'sessao', id: viva.id })
                } catch (e) {
                  window.alert(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
                }
              }}
            />
          </div>
        </>
      )
    }

    if (vista.tipo === 'dashboard') {
      return (
        <>
          <header className="cabecalho">
            <div>
              <h1>Dashboard</h1>
              <div className="caminho">Demandas de todos os projetos, do rascunho ao plano entregue</div>
            </div>
            <div className="abas" style={{ paddingBottom: 10 }}>
              <button className="botao pequeno" onClick={() => setVista({ tipo: 'inicio' })}>
                Tutorial
              </button>
            </div>
          </header>
          <div className="conteudo">
            <Dashboard
              projetos={projetos}
              planos={planos}
              sessoes={listaSessoes}
              observar={observar}
              aoIniciar={(n) => iniciar(n, 'app', true)}
              aoAbrirPlano={(p, id) => void abrirProjeto(p, 'planos', id)}
              aoAbrirSessao={(id) => setVista({ tipo: 'sessao', id })}
              aoAdicionarProjeto={() => void adicionarProjeto()}
            />
          </div>
        </>
      )
    }

    if (vista.tipo === 'config') {
      return (
        <>
          <header className="cabecalho">
            <div>
              <h1>Configurações</h1>
              <div className="caminho">Como o app executa o Claude Code</div>
            </div>
          </header>
          <div className="conteudo">
            <Configuracoes aoVerTutorial={() => setVista({ tipo: 'inicio' })} />
          </div>
        </>
      )
    }

    if (vista.tipo === 'sessao') {
      const s = sessoes[vista.id]
      if (!s) return <div className="vazio">Execução não encontrada.</div>
      return (
        <>
          <header className="cabecalho">
            <div style={{ minWidth: 0 }}>
              <h1>{s.titulo}</h1>
              <div className="caminho mono">{s.prompt}</div>
            </div>
            <div className="abas">
              <span className="selo acento" title={s.modelo || undefined}>
                {nomeModelo(s.modelo)}
              </span>
              <Selo rotulo={ROTULO_SESSAO[s.status]} />
            </div>
          </header>
          <div style={{ flex: 1, minHeight: 0 }}>
              <TelaSessao
              sessao={s}
              planos={planos[s.projeto] ?? []}
              irmas={listaSessoes
                .filter((x) => x.projeto === s.projeto && ATIVAS.includes(x.status) && (x.tarefa || x.id === s.id))
                .sort((a, b) => a.iniciada.localeCompare(b.iniciada))}
              aoAbrirSessao={(id) => setVista({ tipo: 'sessao', id })}
              aoAbrirPlano={(id) => void abrirProjeto(s.projeto, 'planos', id)}
              aoDescartar={async () => {
                await window.orch.sessoes.descartar(s.id)
                setSessoes(({ [s.id]: _, ...resto }) => resto)
                void abrirProjeto(s.projeto, 'execucoes')
              }}
            />
          </div>
        </>
      )
    }

    if (vista.tipo === 'projeto') {
      const lista = planos[vista.caminho] ?? []
      const plano = vista.plano ? lista.find((p) => p.id === vista.plano) : undefined
      return (
        <>
          <header className="cabecalho">
            <div style={{ minWidth: 0 }}>
              <div className="linha">
                <h1>{nomePasta(vista.caminho)}</h1>
                {info?.caminho === vista.caminho &&
                  (info.temPerfil ? <span className="selo ok">especializado</span> : <span className="selo">sem perfil</span>)}
              </div>
              <div className="caminho">{vista.caminho}</div>
            </div>
            <div className="abas">
              <button
                className={`aba ${vista.aba === 'planos' ? 'ativa' : ''}`}
                onClick={() => setVista({ ...vista, aba: 'planos', plano: undefined })}
              >
                Planos ({lista.length})
              </button>
              <button
                className={`aba ${vista.aba === 'execucoes' ? 'ativa' : ''}`}
                onClick={() => setVista({ ...vista, aba: 'execucoes', plano: undefined })}
              >
                Execuções
              </button>
              <button
                className={`aba ${vista.aba === 'paralelo' ? 'ativa' : ''}`}
                onClick={() => setVista({ ...vista, aba: 'paralelo', plano: undefined })}
              >
                Paralelo ({listaSessoes.filter((s) => s.projeto === vista.caminho && ATIVAS.includes(s.status)).length})
              </button>
              <button
                className={`aba ${vista.aba === 'alteracoes' ? 'ativa' : ''}`}
                onClick={() => setVista({ ...vista, aba: 'alteracoes' })}
              >
                Alterações
              </button>
              <button className={`aba ${vista.aba === 'git' ? 'ativa' : ''}`} onClick={() => setVista({ ...vista, aba: 'git' })}>
                Git
              </button>
              <button className={`aba ${vista.aba === 'nova' ? 'ativa' : ''}`} onClick={() => setVista({ ...vista, aba: 'nova' })}>
                Nova execução
              </button>
            </div>
          </header>
          <div className={`conteudo ${vista.aba === 'alteracoes' || vista.aba === 'paralelo' ? 'sem-rolagem' : ''}`}>
            {info?.caminho === vista.caminho && !info.existe && (
              <div className="aviso">Esta pasta não existe mais. Remova o projeto ou escolha outra pasta.</div>
            )}
            {vista.aba === 'execucoes' ? (
              <Execucoes
                projeto={vista.caminho}
                versao={listaSessoes.map((s) => `${s.id}:${s.status}`).join('|')}
                aoAbrir={(e) =>
                  e.idAoVivo
                    ? setVista({ tipo: 'sessao', id: e.idAoVivo })
                    : setVista({ tipo: 'execucao', projeto: vista.caminho, arquivo: e.arquivo })
                }
                aoNova={() => setVista({ ...vista, aba: 'nova' })}
              />
            ) : vista.aba === 'paralelo' ? (
              <Paralelo
                sessoes={listaSessoes.filter((s) => s.projeto === vista.caminho)}
                planos={lista}
                aoAbrirSessao={(id) => setVista({ tipo: 'sessao', id })}
                aoAbrirPlano={(id) => void abrirProjeto(vista.caminho, 'planos', id)}
              />
            ) : vista.aba === 'alteracoes' ? (
              <Alteracoes projeto={vista.caminho} aoIrParaGit={() => setVista({ ...vista, aba: 'git' })} />
            ) : vista.aba === 'git' ? (
              <Git projeto={vista.caminho} aoVerAlteracoes={() => setVista({ ...vista, aba: 'alteracoes' })} />
            ) : vista.aba === 'nova' ? (
              <NovaExecucao projeto={vista.caminho} aoIniciar={(n, onde) => void iniciar(n, onde)} />
            ) : plano ? (
              <DetalhePlano
                plano={plano}
                projeto={vista.caminho}
                ocupado={ocupadoNo(vista.caminho)}
                sessoes={listaSessoes}
                fila={fila}
                aoVoltar={() => setVista({ ...vista, plano: undefined })}
                aoAbrirSessao={(id) => setVista({ tipo: 'sessao', id })}
                aoVerParalelo={() => setVista({ ...vista, aba: 'paralelo', plano: undefined })}
                aoExecutar={async (p, modelo, onde, paralelo, isolamento) => {
                  if (isolamento === 'branch') {
                    try {
                      await window.orch.planos.prepararBranch(vista.caminho, p.id)
                    } catch (e) {
                      window.alert(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
                      return
                    }
                  }
                  void iniciar(
                    {
                      projeto: vista.caminho,
                      prompt: promptPlano(p.id, paralelo),
                      titulo: `${p.status === 'planejado' ? 'Executar' : 'Retomar'}: ${p.titulo}`,
                      modoPermissao: 'default',
                      modelo
                    },
                    onde
                  )
                }}
              />
            ) : (
              <ListaPlanos
                planos={lista}
                aoAbrir={(id) => setVista({ ...vista, plano: id })}
                aoNovo={() => setVista({ ...vista, aba: 'nova' })}
              />
            )}
            {vista.aba === 'planos' && !plano && (
              <div style={{ marginTop: 24 }}>
                <button
                  className="botao pequeno perigo"
                  onClick={async () => {
                    setProjetos(await window.orch.projetos.remover(vista.caminho))
                    await window.orch.planos.pararDeObservar(vista.caminho)
                    setVista({ tipo: 'inicio' })
                  }}
                >
                  Remover projeto da lista
                </button>
              </div>
            )}
          </div>
        </>
      )
    }

    const comInit = listaSessoes.filter((s) => s.orchCarregado !== null)
    return (
      <div className="conteudo">
        <Inicio
          login={login}
          projetos={projetos}
          orchCarregado={comInit.length === 0 ? null : comInit.some((s) => s.orchCarregado)}
          aoFazerLogin={() => void window.orch.login.abrir()}
          aoAdicionarProjeto={() => void adicionarProjeto()}
          aoAbrirProjeto={(c) => void abrirProjeto(c)}
          aoAbrirConfig={() => setVista({ tipo: 'config' })}
        />
      </div>
    )
  }
}
