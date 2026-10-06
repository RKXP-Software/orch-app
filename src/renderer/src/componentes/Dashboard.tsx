import { useCallback, useEffect, useMemo, useState } from 'react'
import { infoModo, MODOS } from '@shared/permissoes'
import { progresso } from '@shared/plano'
import {
  COLUNAS,
  colunaDoCartao,
  novoCartao,
  planosDoCartao,
  promptDoCartao,
  type Cartao,
  type ColunaQuadro,
  type Quadro
} from '@shared/quadro'
import type { ModoPermissao, NovaSessao, Plano, Projeto, Sessao } from '@shared/tipos'
import { nomePasta, ROTULO_PLANO } from '../util'
import { CartoesModelo, useModeloInicial } from './SeletorModelo'
import { Progresso, Selo } from './Selo'

type Ref = { projeto: string; cartao: Cartao }

const ATIVA = ['iniciando', 'executando', 'aguardando-voce'] as const

function Modal({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aoFechar])
  return (
    <div className="modal-fundo" onMouseDown={aoFechar}>
      <div className="modal cartao" role="dialog" aria-label={titulo} onMouseDown={(e) => e.stopPropagation()}>
        <div className="linha" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>{titulo}</h2>
          <span className="espaco" />
          <button className="botao icone" onClick={aoFechar} title="Fechar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Escolha de modelo e permissões antes de mandar o cartão para o orquestrador. */
function ModalExecutar({
  alvo,
  plano,
  aoFechar,
  aoConfirmar
}: {
  alvo: Ref
  plano: Plano | null
  aoFechar: () => void
  aoConfirmar: (prompt: string, titulo: string, modelo: string, modo: ModoPermissao) => void
}) {
  const [modelo, setModelo] = useModeloInicial()
  const [modo, setModo] = useState<ModoPermissao>('default')
  const c = alvo.cartao
  return (
    <Modal titulo={plano ? `Executar: ${c.titulo}` : `Planejar: ${c.titulo}`} aoFechar={aoFechar}>
      {plano ? (
        <p className="muted" style={{ marginTop: 0 }}>
          Executa o plano <span className="mono">{plano.id}</span> ({progresso(plano).feitas}/{progresso(plano).total} tarefas
          feitas). Tarefas concluídas são mantidas.
        </p>
      ) : (
        <div className="previa" style={{ whiteSpace: 'pre-wrap', marginBottom: 12, maxHeight: 140, overflow: 'auto' }}>
          {c.descricao || c.titulo}
        </div>
      )}
      <div className="campo" style={{ marginBottom: 12 }}>
        <label>Modelo do Claude</label>
        <CartoesModelo valor={modelo} aoMudar={setModelo} />
      </div>
      <div className="campo" style={{ marginBottom: 16 }}>
        <label htmlFor="modo-quadro">Permissões</label>
        <select id="modo-quadro" className="entrada" value={modo} onChange={(e) => setModo(e.target.value as ModoPermissao)}>
          {MODOS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </select>
        <span className="ajuda">{infoModo(modo).ajuda}</span>
      </div>
      <div className="linha" style={{ justifyContent: 'flex-end' }}>
        {plano ? (
          <button
            className="botao primario"
            onClick={() => aoConfirmar(`/orch:orquestrar --executar ${plano.id}`, `Executar: ${c.titulo}`, modelo, modo)}
          >
            Executar plano
          </button>
        ) : (
          <>
            <button className="botao" onClick={() => aoConfirmar(promptDoCartao(c, true), `Orquestrar: ${c.titulo}`, modelo, modo)}>
              Planejar e executar
            </button>
            <button className="botao primario" onClick={() => aoConfirmar(promptDoCartao(c, false), `Planejar: ${c.titulo}`, modelo, modo)}>
              Só planejar
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

function ModalEditar({
  alvo,
  projetos,
  aoFechar,
  aoSalvar,
  aoExcluir
}: {
  alvo: Ref | { projeto: string; cartao: null }
  projetos: Projeto[]
  aoFechar: () => void
  aoSalvar: (projeto: string, titulo: string, descricao: string) => void
  aoExcluir?: () => void
}) {
  const [projeto, setProjeto] = useState(alvo.projeto)
  const [titulo, setTitulo] = useState(alvo.cartao?.titulo ?? '')
  const [descricao, setDescricao] = useState(alvo.cartao?.descricao ?? '')
  const novo = !alvo.cartao
  return (
    <Modal titulo={novo ? 'Nova demanda' : 'Editar demanda'} aoFechar={aoFechar}>
      <div className="formulario" style={{ maxWidth: 'none' }}>
        {novo && (
          <div className="campo">
            <label htmlFor="q-projeto">Projeto</label>
            <select id="q-projeto" className="entrada" value={projeto} onChange={(e) => setProjeto(e.target.value)}>
              {projetos.map((p) => (
                <option key={p.caminho} value={p.caminho}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="campo">
          <label htmlFor="q-titulo">Título</label>
          <input id="q-titulo" className="entrada" autoFocus value={titulo} placeholder="Ex.: Login com JWT" onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="q-descricao">Descrição</label>
          <textarea
            id="q-descricao"
            className="entrada"
            style={{ minHeight: 160 }}
            value={descricao}
            placeholder={'O que deve virar um plano: objetivo, contexto, o que está fora do escopo e quando está pronto.\n\nEx.: Proteger as rotas /api/* com JWT. Login em /auth/login devolve o token. Testes para token válido, expirado e ausente.'}
            onChange={(e) => setDescricao(e.target.value)}
          />
          <span className="ajuda">É o que o orquestrador recebe para montar o plano: quanto mais claro, melhor o plano.</span>
        </div>
        <div className="linha">
          {aoExcluir && (
            <button
              className="botao perigo"
              onClick={() => window.confirm('Excluir este cartão? Os planos já criados continuam no projeto.') && aoExcluir()}
            >
              Excluir
            </button>
          )}
          <span className="espaco" />
          <button className="botao" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="botao primario" disabled={!titulo.trim() || !projeto} onClick={() => aoSalvar(projeto, titulo.trim(), descricao.trim())}>
            Salvar
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function Dashboard({
  projetos,
  planos,
  sessoes,
  observar,
  aoIniciar,
  aoAbrirPlano,
  aoAbrirSessao,
  aoAdicionarProjeto
}: {
  projetos: Projeto[]
  planos: Record<string, Plano[]>
  sessoes: Sessao[]
  observar: (projeto: string) => Promise<void>
  aoIniciar: (n: NovaSessao) => Promise<Sessao | null>
  aoAbrirPlano: (projeto: string, plano: string) => void
  aoAbrirSessao: (id: string) => void
  aoAdicionarProjeto: () => void
}) {
  const [filtro, setFiltro] = useState('')
  const [quadros, setQuadros] = useState<Record<string, Quadro>>({})
  const [editando, setEditando] = useState<Ref | { projeto: string; cartao: null } | null>(null)
  const [executando, setExecutando] = useState<{ alvo: Ref; plano: Plano | null } | null>(null)
  const [arrastando, setArrastando] = useState<ColunaQuadro | null>(null)
  /** Execução disparada a partir de cada cartão (só nesta sessão do app). */
  const [execucaoDoCartao, setExecucaoDoCartao] = useState<Record<string, string>>({})

  const carregar = useCallback(async () => {
    const lidos = await Promise.all(projetos.map(async (p) => [p.caminho, await window.orch.quadro.ler(p.caminho)] as const))
    setQuadros(Object.fromEntries(lidos))
  }, [projetos])

  useEffect(() => {
    void carregar()
    projetos.forEach((p) => void observar(p.caminho))
    window.addEventListener('focus', carregar)
    return () => window.removeEventListener('focus', carregar)
  }, [carregar, observar, projetos])

  const salvar = useCallback(async (projeto: string, q: Quadro) => {
    setQuadros((atual) => ({ ...atual, [projeto]: q }))
    const salvo = await window.orch.quadro.salvar(projeto, q)
    setQuadros((atual) => ({ ...atual, [projeto]: salvo }))
  }, [])

  const mudarCartao = useCallback(
    (projeto: string, id: string, mudanca: Partial<Cartao>) => {
      const q = quadros[projeto]
      if (!q) return
      const agora = new Date().toISOString()
      void salvar(projeto, { ...q, cartoes: q.cartoes.map((c) => (c.id === id ? { ...c, ...mudanca, atualizado: agora } : c)) })
    },
    [quadros, salvar]
  )

  // Registra no cartão os planos que apareceram com a marca dele.
  useEffect(() => {
    for (const [projeto, q] of Object.entries(quadros)) {
      const novos = q.cartoes
        .map((c) => ({ c, ids: planosDoCartao(c, planos[projeto] ?? []).map((p) => p.id).filter((id) => !c.planos.includes(id)) }))
        .filter((x) => x.ids.length > 0)
      if (novos.length === 0) continue
      void salvar(projeto, {
        ...q,
        cartoes: q.cartoes.map((c) => {
          const n = novos.find((x) => x.c.id === c.id)
          return n ? { ...c, planos: [...c.planos, ...n.ids] } : c
        })
      })
    }
  }, [planos, quadros, salvar])

  const visiveis = projetos.filter((p) => !filtro || p.caminho === filtro)
  const cartoes = useMemo(
    () =>
      visiveis.flatMap((p) =>
        (quadros[p.caminho]?.cartoes ?? []).map((cartao) => {
          const ps = planosDoCartao(cartao, planos[p.caminho] ?? [])
          return { projeto: p.caminho, cartao, planos: ps, coluna: colunaDoCartao(cartao, planos[p.caminho] ?? []) }
        })
      ),
    [visiveis, quadros, planos]
  )

  const aguardando = sessoes.filter((s) => s.status === 'aguardando-voce' && (!filtro || s.projeto === filtro))
  const ativas = sessoes.filter((s) => (ATIVA as readonly string[]).includes(s.status) && (!filtro || s.projeto === filtro))

  const soltar = (coluna: ColunaQuadro, dados: string) => {
    const [projeto, id] = dados.split('\n')
    const c = quadros[projeto]?.cartoes.find((x) => x.id === id)
    if (!c) return
    // Soltar na coluna que o plano já indica volta a seguir o plano.
    const doPlano = colunaDoCartao({ ...c, fixado: false }, planos[projeto] ?? [])
    mudarCartao(projeto, id, { coluna, fixado: coluna !== doPlano })
  }

  if (projetos.length === 0) {
    return (
      <div className="vazio">
        <h2>Nenhum projeto ainda</h2>
        <p>O quadro organiza demandas por projeto. Adicione um projeto para começar.</p>
        <button className="botao primario" onClick={aoAdicionarProjeto}>
          Adicionar projeto
        </button>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <div className="metricas">
        {COLUNAS.map((col) => (
          <div key={col.id} className="cartao metrica">
            <span className="valor">{cartoes.filter((c) => c.coluna === col.id).length}</span>
            <span className="rotulo">{col.nome}</span>
          </div>
        ))}
        <div className="cartao metrica">
          <span className="valor">{ativas.length}</span>
          <span className="rotulo">Execuções ativas</span>
        </div>
        <button
          className={`cartao metrica ${aguardando.length ? 'destaque' : ''}`}
          disabled={!aguardando.length}
          onClick={() => aguardando[0] && aoAbrirSessao(aguardando[0].id)}
          title={aguardando.length ? 'Abrir a execução que está esperando' : undefined}
        >
          <span className="valor">{aguardando.length}</span>
          <span className="rotulo">Aguardando você</span>
        </button>
      </div>

      <div className="linha" style={{ margin: '16px 0 12px' }}>
        <select className="entrada" style={{ width: 'auto' }} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todos os projetos</option>
          {projetos.map((p) => (
            <option key={p.caminho} value={p.caminho}>
              {p.nome}
            </option>
          ))}
        </select>
        <span className="muted" style={{ fontSize: 12 }}>
          Arraste os cartões entre colunas. Cartões com plano andam sozinhos conforme o plano avança.
        </span>
        <span className="espaco" />
        <button className="botao primario" onClick={() => setEditando({ projeto: filtro || projetos[0].caminho, cartao: null })}>
          + Nova demanda
        </button>
      </div>

      <div className="kanban">
        {COLUNAS.map((col) => {
          const lista = cartoes.filter((c) => c.coluna === col.id)
          return (
            <div
              key={col.id}
              className={`kanban-coluna ${arrastando === col.id ? 'alvo' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setArrastando(col.id)
              }}
              onDragLeave={() => setArrastando((a) => (a === col.id ? null : a))}
              onDrop={(e) => {
                e.preventDefault()
                setArrastando(null)
                soltar(col.id, e.dataTransfer.getData('text/plain'))
              }}
            >
              <div className="kanban-titulo" title={col.ajuda}>
                <span>{col.nome}</span>
                <span className="selo">{lista.length}</span>
              </div>
              {lista.length === 0 && <div className="kanban-vazio">{col.ajuda}</div>}
              {lista.map(({ projeto, cartao: c, planos: ps, coluna }) => {
                const execucao = execucaoDoCartao[c.id] ? sessoes.find((s) => s.id === execucaoDoCartao[c.id]) : undefined
                const pendente = ps.find((p) => p.status !== 'concluido' && p.status !== 'cancelado') ?? null
                return (
                  <div
                    key={`${projeto}:${c.id}`}
                    className="cartao kanban-cartao"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', `${projeto}\n${c.id}`)}
                    onClick={() => setEditando({ projeto, cartao: c })}
                  >
                    {!filtro && <span className="kanban-projeto">{nomePasta(projeto)}</span>}
                    <div className="kanban-cartao-titulo">{c.titulo}</div>
                    {c.descricao && <div className="kanban-descricao">{c.descricao}</div>}

                    {ps.map((p) => {
                      const pr = progresso(p)
                      return (
                        <button
                          key={p.id}
                          className="kanban-plano"
                          onClick={(e) => {
                            e.stopPropagation()
                            aoAbrirPlano(projeto, p.id)
                          }}
                          title="Abrir o plano"
                        >
                          <span className="linha" style={{ gap: 6 }}>
                            <span className="espaco" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.titulo}
                            </span>
                            <Selo rotulo={ROTULO_PLANO[p.status]} />
                          </span>
                          <Progresso pct={pr.pct} />
                          <span className="muted" style={{ fontSize: 11 }}>
                            {pr.feitas}/{pr.total} tarefas
                          </span>
                        </button>
                      )
                    })}

                    {coluna === 'planejando' && ps.length === 0 && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        <span className="ponto andamento" style={{ display: 'inline-block', marginRight: 6 }} />
                        Montando o plano…
                      </div>
                    )}

                    <div className="kanban-acoes" onClick={(e) => e.stopPropagation()}>
                      {c.fixado && (
                        <button className="link" style={{ fontSize: 11 }} title="Voltar a seguir o status do plano" onClick={() => mudarCartao(projeto, c.id, { fixado: false })}>
                          fixado · seguir plano
                        </button>
                      )}
                      <span className="espaco" />
                      {execucao && (
                        <button className="botao pequeno" onClick={() => aoAbrirSessao(execucao.id)}>
                          Ver execução
                        </button>
                      )}
                      {(coluna === 'ideias' || (coluna === 'planejando' && !execucao)) && ps.length === 0 && (
                        <button className="botao pequeno primario" onClick={() => setExecutando({ alvo: { projeto, cartao: c }, plano: null })}>
                          Planejar…
                        </button>
                      )}
                      {pendente && (coluna === 'planejado' || coluna === 'executando') && !(execucao && (ATIVA as readonly string[]).includes(execucao.status)) && (
                        <button className="botao pequeno primario" onClick={() => setExecutando({ alvo: { projeto, cartao: c }, plano: pendente })}>
                          {pendente.status === 'planejado' ? 'Executar…' : 'Retomar…'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {col.id === 'ideias' && (
                <button className="kanban-novo" onClick={() => setEditando({ projeto: filtro || projetos[0].caminho, cartao: null })}>
                  + Nova demanda
                </button>
              )}
            </div>
          )
        })}
      </div>

      {editando && (
        <ModalEditar
          alvo={editando}
          projetos={projetos}
          aoFechar={() => setEditando(null)}
          aoSalvar={(projeto, titulo, descricao) => {
            if (editando.cartao) {
              mudarCartao(projeto, editando.cartao.id, { titulo, descricao })
            } else {
              const q = quadros[projeto] ?? { schema: 'orch.quadro/1' as const, cartoes: [] }
              void salvar(projeto, { ...q, cartoes: [...q.cartoes, novoCartao(titulo, descricao)] })
            }
            setEditando(null)
          }}
          aoExcluir={
            editando.cartao
              ? () => {
                  const q = quadros[editando.projeto]
                  void salvar(editando.projeto, { ...q, cartoes: q.cartoes.filter((c) => c.id !== editando.cartao!.id) })
                  setEditando(null)
                }
              : undefined
          }
        />
      )}

      {executando && (
        <ModalExecutar
          alvo={executando.alvo}
          plano={executando.plano}
          aoFechar={() => setExecutando(null)}
          aoConfirmar={async (prompt, titulo, modelo, modo) => {
            const { projeto, cartao } = executando.alvo
            setExecutando(null)
            const s = await aoIniciar({ projeto, prompt, titulo, modelo, modoPermissao: modo })
            if (s) setExecucaoDoCartao((m) => ({ ...m, [cartao.id]: s.id }))
            if (!executando.plano) mudarCartao(projeto, cartao.id, { coluna: 'planejando', fixado: false })
          }}
        />
      )}
    </div>
  )
}
