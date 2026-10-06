import { useEffect, useMemo, useState } from 'react'
import { conflitosDeArquivos, motivoIndisponivel, tarefasSelecionaveis } from '@shared/execucao'
import { progresso, tarefasProntas } from '@shared/plano'
import { LIMITE_PARALELO } from '@shared/tipos'
import type { Configuracao, Isolamento, ItemFila, MergeWorktree, ModoExecucao, Plano, Sessao, Tarefa } from '@shared/tipos'
import { dataHora, ROTULO_PLANO, ROTULO_TAREFA } from '../util'
import { Progresso, Selo } from './Selo'
import { SeletorModelo, useModeloInicial } from './SeletorModelo'

const ATIVAS = ['iniciando', 'executando', 'aguardando-voce', 'ociosa']

function erroLegivel(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function ListaPlanos({
  planos,
  aoAbrir,
  aoNovo
}: {
  planos: Plano[]
  aoAbrir: (id: string) => void
  aoNovo: () => void
}) {
  if (planos.length === 0) {
    return (
      <div className="vazio">
        <h2>Nenhum plano neste projeto ainda</h2>
        <p>Os planos criados pelo /orch:orquestrar aparecem aqui e são atualizados ao vivo.</p>
        <button className="botao primario" onClick={aoNovo}>
          Nova demanda
        </button>
      </div>
    )
  }
  return (
    <div className="lista-planos">
      {planos.map((p) => {
        const { feitas, total, pct } = progresso(p)
        return (
          <button key={p.id} className="cartao cartao-plano" onClick={() => aoAbrir(p.id)}>
            <div className="linha">
              <h3>{p.titulo}</h3>
              <span className="espaco" />
              <Selo rotulo={ROTULO_PLANO[p.status]} />
            </div>
            <div className="demanda">{p.demanda}</div>
            <div className="linha">
              <div style={{ flex: 1 }}>
                <Progresso pct={pct} />
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                {feitas}/{total} tarefas · {dataHora(p.criado)}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

interface PropsTarefa {
  plano: Plano
  t: Tarefa
  pronta: boolean
  manual: boolean
  marcada: boolean
  /** Modelo escolhido só para esta tarefa ('' = herda da onda). */
  modelo: string
  naFila: number | null
  /** Sessão (em andamento ou a última) desta tarefa, para abrir a conversa. */
  sessao: Sessao | null
  aoMarcar: (marcar: boolean) => void
  aoMudarModelo: (m: string) => void
  aoAbrirSessao: (id: string) => void
  aoPular: () => void
  aoMesclar: () => void
  aoCancelarFila: () => void
}

function CartaoTarefa(p: PropsTarefa) {
  const { plano, t } = p
  const motivo = motivoIndisponivel(plano, t)
  const selecionavel = motivo === null && !p.naFila
  const classe = t.status === 'pendente' && p.pronta ? 'pronta' : t.status
  return (
    <div className={`cartao tarefa ${classe}`}>
      <div className="linha">
        {p.manual && (
          <input
            type="checkbox"
            checked={p.marcada}
            disabled={!selecionavel}
            title={selecionavel ? 'Executar esta tarefa' : p.naFila ? 'Na fila' : (motivo ?? '')}
            aria-label={`Executar ${t.id}`}
            onChange={(e) => p.aoMarcar(e.target.checked)}
          />
        )}
        <span className="mono">{t.id}</span>
        <span className="espaco" />
        {p.naFila ? (
          <Selo rotulo={[`Na fila (${p.naFila})`, 'acento']} />
        ) : (
          <Selo rotulo={t.status === 'pendente' && p.pronta ? ['Pronta', 'acento'] : ROTULO_TAREFA[t.status]} />
        )}
      </div>
      <div className="titulo">{t.titulo}</div>
      <div className="executor">{t.executor}</div>
      {t.dependeDe.length > 0 && <div className="detalhe">Depende de {t.dependeDe.join(', ')}</div>}
      {t.arquivos.length > 0 && <div className="detalhe mono">{t.arquivos.join(', ')}</div>}
      {t.modelo && t.status !== 'pendente' && <div className="detalhe">Modelo: {t.modelo}</div>}
      {t.resultado && <div className="detalhe">{t.resultado}</div>}
      {t.merge && (
        <div className="detalhe">
          <span className={`selo ${t.merge === 'conflito' ? 'erro' : t.merge === 'mesclado' ? 'ok' : 'acento'}`}>
            {t.merge === 'conflito' ? 'Conflito no merge' : t.merge === 'mesclado' ? 'Mesclada' : 'Aguardando merge'}
          </span>
        </div>
      )}

      {p.manual && selecionavel && (
        <div className="detalhe">
          <SeletorModelo
            rotulo=""
            vazio="Modelo da onda"
            titulo="Modelo só desta tarefa (vazio = o da onda)"
            valor={p.modelo}
            aoMudar={p.aoMudarModelo}
          />
        </div>
      )}

      <div className="linha acoes-tarefa">
        {p.sessao && (
          <button className="botao pequeno" onClick={() => p.aoAbrirSessao(p.sessao!.id)}>
            Abrir conversa
          </button>
        )}
        {p.naFila && (
          <button className="botao pequeno" onClick={p.aoCancelarFila}>
            Tirar da fila
          </button>
        )}
        {p.manual && t.status === 'falhou' && !p.naFila && (
          <button className="botao pequeno" onClick={p.aoPular}>
            Pular
          </button>
        )}
        {t.status === 'concluida' && t.merge && t.merge !== 'mesclado' && (
          <button className="botao pequeno primario" onClick={p.aoMesclar}>
            Mesclar
          </button>
        )}
      </div>
    </div>
  )
}

export function DetalhePlano({
  plano,
  projeto,
  ocupado,
  sessoes,
  fila,
  aoVoltar,
  aoExecutar,
  aoAbrirSessao,
  aoVerParalelo
}: {
  plano: Plano
  projeto: string
  ocupado: boolean
  sessoes: Sessao[]
  fila: ItemFila[]
  aoVoltar: () => void
  /** Modo automático: uma sessão executa o plano inteiro. */
  aoExecutar: (p: Plano, modelo: string, onde: 'app' | 'terminal', paralelo: number, isolamento: Isolamento) => void
  aoAbrirSessao: (id: string) => void
  aoVerParalelo: () => void
}) {
  const [modelo, setModelo] = useModeloInicial()
  const [cfg, setCfg] = useState<Configuracao | null>(null)
  const [modo, setModo] = useState<ModoExecucao>('automatico')
  const [isolamento, setIsolamento] = useState<Isolamento>('mesma-pasta')
  const [mergeWorktree, setMergeWorktree] = useState<MergeWorktree>('manual')
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [modeloOnda, setModeloOnda] = useState<Record<number, string>>({})
  const [modeloTarefa, setModeloTarefa] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    void window.orch.config.ler().then((c) => {
      setCfg(c)
      setModo(c.modoExecucaoPadrao)
      setIsolamento(c.isolamento)
      setMergeWorktree(c.mergeWorktree)
    })
  }, [])

  const { feitas, total, pct } = progresso(plano)
  const prontas = new Set(tarefasProntas(plano))
  const selecionaveis = useMemo(() => new Set(tarefasSelecionaveis(plano)), [plano])
  const porId = new Map(plano.tarefas.map((t) => [t.id, t]))
  const podeExecutar = plano.status !== 'concluido' && plano.status !== 'cancelado'
  const manual = modo === 'manual' && plano.origem === 'json'
  const limite = Math.min(cfg?.maxParalelo ?? 3, LIMITE_PARALELO)
  // Worktree só existe no modo manual: no automático volta para a mesma pasta.
  const isolamentoEfetivo: Isolamento = modo === 'automatico' && isolamento === 'worktree' ? 'mesma-pasta' : isolamento

  const doPlano = sessoes.filter((s) => s.plano === plano.id && s.projeto === projeto)
  const sessaoDaTarefa = (id: string): Sessao | null => {
    const dela = doPlano.filter((s) => s.tarefa === id).sort((a, b) => b.iniciada.localeCompare(a.iniciada))
    return dela[0] ?? null
  }
  const filaDoPlano = fila.filter((f) => f.projeto === projeto && f.plano === plano.id)
  const posicaoNaFila = (id: string) => {
    const i = filaDoPlano.findIndex((f) => f.tarefa === id)
    return i < 0 ? null : i + 1
  }
  const rodando = plano.tarefas.filter((t) => t.status === 'em-andamento').length
  const livreParaMarcar = (id: string) => selecionaveis.has(id) && !posicaoNaFila(id)

  const alternar = (id: string, marcar: boolean) =>
    setMarcadas((atual) => {
      const novo = new Set(atual)
      if (marcar) novo.add(id)
      else novo.delete(id)
      return novo
    })

  const executarOnda = async (n: number, ids: string[]) => {
    setErro(null)
    const pedidos = ids
      .filter((id) => marcadas.has(id) && livreParaMarcar(id))
      .map((id) => ({ tarefa: id, modelo: modeloTarefa[id] || modeloOnda[n] || modelo }))
    if (pedidos.length === 0) return
    try {
      await window.orch.planos.executarTarefas(projeto, plano.id, pedidos, { isolamento: isolamentoEfetivo, mergeWorktree })
      setMarcadas((atual) => new Set([...atual].filter((id) => !pedidos.some((p) => p.tarefa === id))))
    } catch (e) {
      setErro(erroLegivel(e))
    }
  }

  const acao = async (fn: () => Promise<void>) => {
    setErro(null)
    try {
      await fn()
    } catch (e) {
      setErro(erroLegivel(e))
    }
  }

  return (
    <div>
      <button className="botao pequeno" onClick={aoVoltar} style={{ marginBottom: 14 }}>
        ← Planos
      </button>

      <div className="plano-topo">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="linha">
            <h2>{plano.titulo}</h2>
            <Selo rotulo={ROTULO_PLANO[plano.status]} />
          </div>
          <div className="muted mono">
            {plano.id}
            {plano.commitInicial ? ` · commit ${plano.commitInicial}` : ''}
            {plano.versaoOrch ? ` · orch ${plano.versaoOrch}` : ''}
          </div>
          <p style={{ margin: '10px 0' }}>{plano.objetivo ?? plano.demanda}</p>
          <div className="linha" style={{ maxWidth: 480 }}>
            <div style={{ flex: 1 }}>
              <Progresso pct={pct} />
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              {feitas}/{total} · {pct}%
            </span>
          </div>
        </div>
        <div className="linha" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {plano.arquivoMd && (
            <button className="botao" onClick={() => window.orch.abrirArquivo(plano.arquivoMd!)}>
              Abrir .md
            </button>
          )}
          {doPlano.some((s) => ATIVAS.includes(s.status)) && (
            <button className="botao" onClick={aoVerParalelo}>
              Ver em paralelo
            </button>
          )}
          {podeExecutar && (
            <>
              <SeletorModelo valor={modelo} aoMudar={setModelo} rotulo={manual ? 'Modelo padrão' : 'Modelo'} />
              {!manual && (
                <>
                  <button
                    className="botao"
                    onClick={() => aoExecutar(plano, modelo, 'terminal', limite, isolamentoEfetivo)}
                    title="Executar no CLI do Claude"
                  >
                    No CLI
                  </button>
                  <button
                    className="botao primario"
                    disabled={ocupado}
                    onClick={() => aoExecutar(plano, modelo, 'app', limite, isolamentoEfetivo)}
                  >
                    {plano.status === 'planejado' ? 'Executar' : 'Retomar'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {podeExecutar && (
        <div className="barra-execucao">
          <div className="seletor-tema" role="radiogroup" aria-label="Modo de execução">
            {(
              [
                ['automatico', 'Automático'],
                ['manual', 'Manual por ondas']
              ] as [ModoExecucao, string][]
            ).map(([m, nome]) => (
              <button key={m} role="radio" aria-checked={modo === m} className={modo === m ? 'ativo' : ''} onClick={() => setModo(m)}>
                {nome}
              </button>
            ))}
          </div>
          <label className="seletor-modelo" title="Onde as tarefas trabalham">
            <span>Isolamento</span>
            <select className="entrada" value={isolamentoEfetivo} onChange={(e) => setIsolamento(e.target.value as Isolamento)}>
              <option value="mesma-pasta">Mesma pasta</option>
              <option value="branch">Branch do plano</option>
              <option value="worktree" disabled={modo !== 'manual'}>
                Worktree por tarefa{modo !== 'manual' ? ' (só no manual)' : ''}
              </option>
            </select>
          </label>
          {isolamentoEfetivo === 'worktree' && (
            <label className="seletor-modelo" title="O que fazer com a worktree quando a tarefa termina">
              <span>Merge</span>
              <select className="entrada" value={mergeWorktree} onChange={(e) => setMergeWorktree(e.target.value as MergeWorktree)}>
                <option value="manual">Manual (botão Mesclar)</option>
                <option value="automatico">Automático ao concluir</option>
              </select>
            </label>
          )}
          <span className="espaco" />
          <span className="muted" style={{ fontSize: 12 }}>
            Até {limite} em paralelo
            {manual ? ` · ${rodando} rodando · ${filaDoPlano.length} na fila` : ''}
          </span>
        </div>
      )}

      {modo === 'manual' && plano.origem === 'md' && (
        <div className="aviso">
          O modo manual precisa do estado em .json (orch 0.4.0 ou mais novo). Este plano só pode ser executado no modo automático.
        </div>
      )}
      {erro && (
        <div className="aviso" role="alert" style={{ whiteSpace: 'pre-wrap' }}>
          {erro}
        </div>
      )}

      {plano.origem === 'md' && (
        <div className="aviso">
          Plano criado por uma versão do orch anterior à 0.4.0: o estado foi lido do .md e pode estar incompleto.
        </div>
      )}

      <div className="ondas">
        {plano.ondas.map((onda, n) => {
          const disponiveis = onda.filter(livreParaMarcar)
          const marcadasNaOnda = onda.filter((id) => marcadas.has(id) && livreParaMarcar(id))
          const conflitos = isolamentoEfetivo === 'mesma-pasta' ? conflitosDeArquivos(plano, marcadasNaOnda) : []
          return (
            <div className="onda" key={n}>
              <div className="onda-titulo">Onda {n + 1}</div>
              {manual && podeExecutar && (
                <div className="onda-acoes">
                  <SeletorModelo
                    rotulo=""
                    vazio="Modelo padrão"
                    titulo="Modelo desta onda (cada tarefa pode ter o seu)"
                    valor={modeloOnda[n] ?? ''}
                    aoMudar={(m) => setModeloOnda({ ...modeloOnda, [n]: m })}
                  />
                  <div className="linha">
                    <button className="link" disabled={disponiveis.length === 0} onClick={() => setMarcadas((a) => new Set([...a, ...disponiveis]))}>
                      Marcar todas
                    </button>
                    <button
                      className="link"
                      disabled={marcadasNaOnda.length === 0}
                      onClick={() => setMarcadas((a) => new Set([...a].filter((id) => !onda.includes(id))))}
                    >
                      Limpar
                    </button>
                    <span className="espaco" />
                    <button className="botao pequeno primario" disabled={marcadasNaOnda.length === 0} onClick={() => void executarOnda(n, onda)}>
                      Executar ({marcadasNaOnda.length})
                    </button>
                  </div>
                  {marcadasNaOnda.length > Math.max(0, limite - rodando) && (
                    <div className="muted" style={{ fontSize: 11 }}>
                      Passou do limite: as últimas esperam na fila e começam quando houver vaga.
                    </div>
                  )}
                  {conflitos.length > 0 && (
                    <div className="aviso-conflito">
                      Mesmos arquivos: {conflitos.map(([a, b]) => `${a} e ${b}`).join('; ')}. Na mesma pasta podem se atropelar.
                    </div>
                  )}
                </div>
              )}
              {onda.map((id) => {
                const t = porId.get(id)
                return t ? (
                  <CartaoTarefa
                    key={id}
                    plano={plano}
                    t={t}
                    pronta={prontas.has(id)}
                    manual={manual}
                    marcada={marcadas.has(id)}
                    modelo={modeloTarefa[id] ?? ''}
                    naFila={posicaoNaFila(id)}
                    sessao={sessaoDaTarefa(id)}
                    aoMarcar={(m) => alternar(id, m)}
                    aoMudarModelo={(m) => setModeloTarefa({ ...modeloTarefa, [id]: m })}
                    aoAbrirSessao={aoAbrirSessao}
                    aoPular={() => void acao(() => window.orch.planos.pularTarefa(projeto, plano.id, id))}
                    aoMesclar={() => void acao(() => window.orch.planos.mesclarTarefa(projeto, plano.id, id))}
                    aoCancelarFila={() => void acao(() => window.orch.planos.cancelarNaFila(projeto, plano.id, id))}
                  />
                ) : null
              })}
            </div>
          )
        })}
      </div>

      <div className="colunas">
        <div>
          <div className="secao-titulo">Demanda original</div>
          <div className="cartao bloco-texto">{plano.demanda || '—'}</div>
          {plano.resultadoFinal && (
            <>
              <div className="secao-titulo" style={{ marginTop: 16 }}>
                Resultado final
              </div>
              <div className="cartao bloco-texto">{plano.resultadoFinal}</div>
            </>
          )}
        </div>
        <div>
          <div className="secao-titulo">Registro de execução</div>
          {plano.eventos.length === 0 ? (
            <div className="muted">Sem eventos.</div>
          ) : (
            <ul className="eventos">
              {[...plano.eventos].reverse().map((e, i) => (
                <li key={i}>
                  <span className="quando">{dataHora(e.quando)}</span>
                  <span>{e.texto}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
