import { useCallback, useEffect, useState } from 'react'
import type { InfoProjeto, NovaSessao, Plano, Projeto, Sessao, StatusLogin, Tema } from '@shared/tipos'
import { Configuracoes } from './componentes/Configuracoes'
import { Inicio } from './componentes/Inicio'
import { NovaExecucao } from './componentes/NovaExecucao'
import { DetalhePlano, ListaPlanos } from './componentes/Planos'
import { TelaSessao } from './componentes/Sessao'
import { Selo } from './componentes/Selo'
import { nomePasta, ROTULO_SESSAO } from './util'

type Vista =
  | { tipo: 'inicio' }
  | { tipo: 'projeto'; caminho: string; aba: 'planos' | 'nova'; plano?: string }
  | { tipo: 'sessao'; id: string }
  | { tipo: 'config' }

export function App() {
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [info, setInfo] = useState<InfoProjeto | null>(null)
  const [planos, setPlanos] = useState<Record<string, Plano[]>>({})
  const [sessoes, setSessoes] = useState<Record<string, Sessao>>({})
  const [vista, setVista] = useState<Vista>({ tipo: 'inicio' })
  const [login, setLogin] = useState<StatusLogin | null>(null)
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
    void window.orch.projetos.listar().then(setProjetos)
    void window.orch.sessoes.listar().then((l) => setSessoes(Object.fromEntries(l.map((s) => [s.id, s]))))
    const a = window.orch.planos.aoMudar((projeto, lista) => setPlanos((p) => ({ ...p, [projeto]: lista })))
    const b = window.orch.sessoes.aoMudar((s) => setSessoes((atual) => ({ ...atual, [s.id]: { ...s } })))
    return () => {
      a()
      b()
    }
  }, [])

  const observar = useCallback(async (caminho: string) => {
    const lista = await window.orch.planos.observar(caminho)
    setPlanos((p) => ({ ...p, [caminho]: lista }))
  }, [])

  const abrirProjeto = useCallback(
    async (caminho: string, aba: 'planos' | 'nova' = 'planos', plano?: string) => {
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

  const iniciar = async (nova: NovaSessao, onde: 'app' | 'terminal' = 'app') => {
    if (onde === 'terminal') {
      await window.orch.abrirNoTerminal(nova)
      setVista({ tipo: 'projeto', caminho: nova.projeto, aba: 'planos' })
      await observar(nova.projeto)
      return
    }
    const s = await window.orch.sessoes.iniciar(nova)
    setSessoes((atual) => ({ ...atual, [s.id]: s }))
    setVista({ tipo: 'sessao', id: s.id })
    await observar(nova.projeto)
  }

  const listaSessoes = Object.values(sessoes).sort((a, b) => b.iniciada.localeCompare(a.iniciada))
  const ocupadoNo = (projeto: string) =>
    listaSessoes.some((s) => s.projeto === projeto && ['iniciando', 'executando', 'aguardando-voce'].includes(s.status))

  return (
    <div className="app">
      <aside className="lateral">
        <div className="lateral-topo">
          <button className="marca" onClick={() => setVista({ tipo: 'inicio' })} title="Início e tutorial">
            Orch
          </button>
        </div>
        <div className="lateral-rolagem">
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
            <Configuracoes />
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
              <Selo rotulo={ROTULO_SESSAO[s.status]} />
            </div>
          </header>
          <div style={{ flex: 1, minHeight: 0 }}>
            <TelaSessao
              sessao={s}
              planos={planos[s.projeto] ?? []}
              aoAbrirPlano={(id) => void abrirProjeto(s.projeto, 'planos', id)}
              aoDescartar={async () => {
                await window.orch.sessoes.descartar(s.id)
                setSessoes(({ [s.id]: _, ...resto }) => resto)
                void abrirProjeto(s.projeto)
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
              <button className={`aba ${vista.aba === 'nova' ? 'ativa' : ''}`} onClick={() => setVista({ ...vista, aba: 'nova' })}>
                Nova execução
              </button>
            </div>
          </header>
          <div className="conteudo">
            {info?.caminho === vista.caminho && !info.existe && (
              <div className="aviso">Esta pasta não existe mais. Remova o projeto ou escolha outra pasta.</div>
            )}
            {vista.aba === 'nova' ? (
              <NovaExecucao projeto={vista.caminho} aoIniciar={(n, onde) => void iniciar(n, onde)} />
            ) : plano ? (
              <DetalhePlano
                plano={plano}
                ocupado={ocupadoNo(vista.caminho)}
                aoVoltar={() => setVista({ ...vista, plano: undefined })}
                aoExecutar={(p, modelo, onde) =>
                  void iniciar(
                    {
                      projeto: vista.caminho,
                      prompt: `/orch:orquestrar --executar ${p.id}`,
                      titulo: `${p.status === 'planejado' ? 'Executar' : 'Retomar'}: ${p.titulo}`,
                      modoPermissao: 'default',
                      modelo
                    },
                    onde
                  )
                }
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
