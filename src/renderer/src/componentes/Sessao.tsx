import { useEffect, useRef, useState } from 'react'
import { infoModo, MODOS } from '@shared/permissoes'
import { tarefasAoVivo } from '@shared/ao-vivo'
import { nomeModelo } from '@shared/modelos'
import { progresso } from '@shared/plano'
import type { ContextoSessao, EntradaLog, ModoPermissao, Pendencia, Plano, Sessao } from '@shared/tipos'
import { dataHora, duracao, hora, nomePasta, ROTULO_PLANO, ROTULO_SESSAO, ROTULO_TAREFA, tokens, usd } from '../util'
import { Progresso, Selo } from './Selo'

const LINHAS_SAIDA = 12

function SaidaTerminal({ texto, erro }: { texto: string; erro: boolean }) {
  const [aberta, setAberta] = useState(false)
  const linhas = texto.replace(/\s+$/, '').split('\n')
  const visiveis = aberta ? linhas : linhas.slice(0, LINHAS_SAIDA)
  return (
    <div className={`t-saida ${erro ? 't-erro' : ''}`}>
      {visiveis.map((l, i) => (
        <div key={i}>
          <span className="t-dim">{i === 0 ? '  ⎿  ' : '     '}</span>
          {l}
        </div>
      ))}
      {linhas.length > LINHAS_SAIDA && (
        <button className="t-mais" onClick={() => setAberta(!aberta)}>
          {'     '}
          {aberta ? '(recolher)' : `… +${linhas.length - LINHAS_SAIDA} linhas (expandir)`}
        </button>
      )}
    </div>
  )
}

/** A execução no estilo do CLI do Claude Code: mensagens, chamadas de ferramenta e suas saídas. */
function LinhaTerminal({ e }: { e: EntradaLog }) {
  const sub = 'subagente' in e && typeof e.subagente === 'string' && e.subagente ? (
    <span className="t-sub">[{e.subagente}] </span>
  ) : null
  switch (e.tipo) {
    case 'usuario':
      return (
        <div className="t-usuario">
          <span className="t-acento">&gt; </span>
          {e.texto}
        </div>
      )
    case 'texto':
      return (
        <div className="t-bloco">
          <span className="t-branco">● </span>
          {e.texto}
        </div>
      )
    case 'ferramenta':
      return (
        <div className="t-bloco">
          <span className="t-verde">● </span>
          {sub}
          <span className="t-negrito">{e.nome}</span>
          <span className="t-dim">(</span>
          {e.resumo}
          <span className="t-dim">)</span>
        </div>
      )
    case 'saida':
      return <SaidaTerminal texto={e.texto} erro={e.erro} />
    case 'subagente':
      return (
        <div className="t-bloco">
          <span className={e.fase === 'inicio' ? 't-acento' : e.status === 'completed' ? 't-verde' : 't-vermelho'}>
            {e.fase === 'inicio' ? '⏺ ' : '✓ '}
          </span>
          <span className="t-negrito">{e.agente ?? 'subagente'}</span>
          <span className="t-dim">{e.fase === 'inicio' ? ' iniciou: ' : ' terminou: '}</span>
          {e.descricao}
        </div>
      )
    case 'sistema':
      return <div className="t-dim">{`※ ${e.texto}`}</div>
    case 'erro':
      return <div className="t-vermelho">{`✗ ${e.texto}`}</div>
    case 'resultado':
      return (
        <div className="t-bloco t-dim">
          {`✻ ${e.sucesso ? 'Turno concluído' : 'Turno com erro'} · ${duracao(e.duracaoMs)} · ${usd(e.custoUsd)} acumulado`}
        </div>
      )
  }
}

function Entrada({ e }: { e: EntradaLog }) {
  switch (e.tipo) {
    case 'saida':
      return null
    case 'usuario':
      return <div className="msg usuario">{e.texto}</div>
    case 'texto':
      return <div className="msg texto">{e.texto}</div>
    case 'ferramenta':
      return (
        <div className="msg ferramenta">
          {e.subagente && <span className="rotulo-sub">{e.subagente}</span>}
          <span className="nome-ferramenta">{e.nome}</span>
          <span className="resumo" title={e.resumo}>
            {e.resumo}
          </span>
        </div>
      )
    case 'subagente':
      return (
        <div className="msg subagente">
          <span className={`ponto ${e.fase === 'inicio' ? 'acento' : e.status === 'completed' ? 'ok' : 'erro'}`} />
          <span>
            <strong>{e.agente ?? 'subagente'}</strong> {e.fase === 'inicio' ? 'iniciou' : 'terminou'}: {e.descricao}
          </span>
        </div>
      )
    case 'sistema':
      return (
        <div className="msg sistema">
          <span className="muted">{hora(e.quando)}</span> {e.texto}
        </div>
      )
    case 'erro':
      return <div className="msg erro">{e.texto}</div>
    case 'resultado':
      return (
        <div className="msg resultado">
          <div className="linha" style={{ marginBottom: 4 }}>
            <Selo rotulo={e.sucesso ? ['Turno concluído', 'ok'] : ['Turno com erro', 'erro']} />
            <span className="muted" style={{ fontSize: 12 }}>
              {duracao(e.duracaoMs)} · {usd(e.custoUsd)} acumulado
            </span>
          </div>
        </div>
      )
  }
}

function CartaoPendencia({
  p,
  aoResponder,
  aoLiberarTudo
}: {
  p: Pendencia
  aoResponder: (r: Parameters<typeof window.orch.sessoes.responder>[2]) => void
  aoLiberarTudo: () => void
}) {
  const [escolhas, setEscolhas] = useState<Record<string, string[]>>({})
  const [outros, setOutros] = useState<Record<string, string>>({})

  if (p.tipo === 'permissao') {
    const ehPlano = p.ferramenta === 'ExitPlanMode'
    return (
      <div className="cartao pendencia">
        <strong>{p.titulo}</strong>
        <div className={`detalhe ${ehPlano ? 'plano-proposto' : ''}`}>{p.detalhe}</div>
        <div className="linha" style={{ flexWrap: 'wrap' }}>
          <button className="botao primario" onClick={() => aoResponder({ tipo: 'permissao', decisao: 'permitir' })}>
            {ehPlano ? 'Aprovar plano' : 'Permitir'}
          </button>
          {p.podeLembrar && (
            <button className="botao" onClick={() => aoResponder({ tipo: 'permissao', decisao: 'permitir-sempre' })}>
              Permitir sempre
            </button>
          )}
          <button
            className="botao perigo"
            onClick={() =>
              aoResponder({
                tipo: 'permissao',
                decisao: 'negar',
                ...(ehPlano ? { mensagem: 'O usuário quer continuar planejando antes de executar.' } : {})
              })
            }
          >
            {ehPlano ? 'Continuar planejando' : 'Negar'}
          </button>
          {!ehPlano && (
            <>
              <span className="espaco" />
              <button
                className="botao pequeno"
                onClick={aoLiberarTudo}
                title="Muda esta execução para Sem confirmações: aprova este pedido e os próximos. Perguntas de planejamento continuam chegando."
              >
                Aprovar tudo daqui em diante
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  const alternar = (q: string, label: string, multi: boolean) =>
    setEscolhas((atual) => {
      const lista = atual[q] ?? []
      const nova = multi ? (lista.includes(label) ? lista.filter((l) => l !== label) : [...lista, label]) : [label]
      return { ...atual, [q]: nova }
    })

  const respostas = Object.fromEntries(
    p.perguntas.map((q) => {
      const partes = [...(escolhas[q.question] ?? [])]
      if (outros[q.question]?.trim()) partes.push(outros[q.question].trim())
      return [q.question, partes.join(', ')]
    })
  )
  const completo = Object.values(respostas).every((r) => r !== '')

  return (
    <div className="cartao pendencia">
      <strong>Claude tem {p.perguntas.length === 1 ? 'uma pergunta' : 'perguntas'}</strong>
      {p.perguntas.map((q) => (
        <div className="pergunta" key={q.question}>
          <div>
            <span className="selo acento">{q.header}</span> {q.question}
          </div>
          <div className="opcoes">
            {q.options.map((o) => {
              const marcada = (escolhas[q.question] ?? []).includes(o.label)
              return (
                <label key={o.label} className={`opcao ${marcada ? 'marcada' : ''}`}>
                  <input
                    type={q.multiSelect ? 'checkbox' : 'radio'}
                    name={q.question}
                    checked={marcada}
                    onChange={() => alternar(q.question, o.label, q.multiSelect)}
                  />
                  <span>
                    {o.label}
                    <small>{o.description}</small>
                  </span>
                </label>
              )
            })}
            <input
              className="entrada"
              placeholder="Outra resposta…"
              value={outros[q.question] ?? ''}
              onChange={(e) => {
                setOutros({ ...outros, [q.question]: e.target.value })
                if (!q.multiSelect && e.target.value) setEscolhas({ ...escolhas, [q.question]: [] })
              }}
            />
          </div>
        </div>
      ))}
      <button className="botao primario" disabled={!completo} onClick={() => aoResponder({ tipo: 'pergunta', respostas })}>
        Responder
      </button>
    </div>
  )
}

function MiniPlano({ plano, aoVivo, aoAbrir }: { plano: Plano; aoVivo: Map<string, string>; aoAbrir: () => void }) {
  const { feitas, total, pct } = progresso(plano)
  return (
    <button className="cartao mini-plano" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={aoAbrir}>
      <div className="linha" style={{ marginBottom: 6 }}>
        <strong style={{ flex: 1, fontSize: 13 }}>{plano.titulo}</strong>
        <Selo rotulo={ROTULO_PLANO[plano.status]} />
      </div>
      <Progresso pct={pct} />
      <div className="muted" style={{ fontSize: 11, margin: '4px 0 6px' }}>
        {feitas}/{total} tarefas
      </div>
      {plano.tarefas.map((t) => {
        // Um subagente já está nesta tarefa, mas o arquivo do plano ainda não foi regravado.
        const agente = plano.status === 'em-execucao' && t.status === 'pendente' ? aoVivo.get(t.id) : undefined
        const tom = agente ? 'andamento' : ROTULO_TAREFA[t.status][1]
        return (
          <div className="t" key={t.id} title={agente ? `${agente} trabalhando agora` : ROTULO_TAREFA[t.status][0]}>
            <span className={`ponto ${tom}`} />
            <span className="mono">{t.id}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.titulo}</span>
            {(agente || t.status === 'em-andamento') && <span className="ao-vivo">{agente ?? t.executor}</span>}
          </div>
        )
      })}
    </button>
  )
}

const COR_CATEGORIA = ['#7c86ff', '#4cc07c', '#f0a53a', '#c79bff', '#5ec4d6', '#f06a62', '#b0b7c3']

function PainelContexto({ sessao }: { sessao: Sessao }) {
  const [aberto, setAberto] = useState(false)
  const c: ContextoSessao | null = sessao.contexto
  const ativa = ['iniciando', 'executando', 'aguardando-voce', 'ociosa'].includes(sessao.status)

  const usadas = c?.categorias.filter((x) => x.tipo === 'used').sort((a, b) => b.tokens - a.tokens) ?? []
  const tom = !c ? '' : c.pct >= 85 ? 'erro' : c.pct >= 60 ? 'andamento' : 'ok'

  return (
    <div className="contexto">
      <div className="linha secao-titulo">
        <span>Contexto</span>
        <span className="espaco" />
        {ativa && (
          <button
            className="botao pequeno"
            onClick={() => void window.orch.sessoes.atualizarContexto(sessao.id)}
            title="Detalhamento completo, como o /context do CLI"
          >
            Detalhar
          </button>
        )}
      </div>
      {!c ? (
        <div className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
          Aparece depois da primeira resposta do Claude.
        </div>
      ) : (
        <>
          <div className={`barra contexto-barra ${tom}`} role="progressbar" aria-valuenow={c.pct} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${Math.min(c.pct, 100)}%` }} />
          </div>
          <div className="contexto-total">
            <strong>{tokens(c.usados)}</strong>
            {c.maximo > 0 && <span className="muted"> / {tokens(c.maximo)} tokens · {c.pct}%</span>}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            {c.origem === 'estimado' ? 'estimado pela última resposta' : 'detalhado'} · {dataHora(c.atualizado)}
          </div>
          {usadas.length > 0 && (
            <ul className="contexto-categorias">
              {usadas.map((x, n) => (
                <li key={x.nome}>
                  <span className="quadrado" style={{ background: COR_CATEGORIA[n % COR_CATEGORIA.length] }} />
                  <span className="nome">{x.nome}</span>
                  <span className="mono">{tokens(x.tokens)}</span>
                </li>
              ))}
            </ul>
          )}
          {c.memoria.length > 0 && (
            <>
              <button className="link" style={{ fontSize: 12 }} onClick={() => setAberto(!aberto)}>
                {aberto ? 'Ocultar' : 'Ver'} arquivos de memória ({c.memoria.length})
              </button>
              {aberto && (
                <ul className="contexto-categorias">
                  {c.memoria.map((m) => (
                    <li key={m.caminho} title={m.caminho}>
                      <span className="nome mono">{nomePasta(m.caminho)}</span>
                      <span className="mono">{tokens(m.tokens)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

export function TelaSessao({
  sessao,
  planos,
  aoAbrirPlano,
  aoDescartar,
  aoContinuar,
  compacto = false,
  irmas = [],
  aoAbrirSessao
}: {
  sessao: Sessao
  planos: Plano[]
  aoAbrirPlano: (id: string) => void
  aoDescartar: () => void
  /** Dentro da grade paralela: só a conversa, sem o painel lateral. */
  compacto?: boolean
  /** Tarefas em execução em paralelo no projeto (listadas no painel lateral). */
  irmas?: Sessao[]
  aoAbrirSessao?: (id: string) => void
  /** Execução gravada (reaberta do arquivo): retoma a conversa do Claude. */
  aoContinuar?: () => void
}) {
  const [texto, setTexto] = useState('')
  const [visao, setVisao] = useState<'conversa' | 'terminal'>('conversa')
  const fimLog = useRef<HTMLDivElement>(null)
  const ativa = ['iniciando', 'executando', 'aguardando-voce', 'ociosa'].includes(sessao.status)
  const rodando = ['iniciando', 'executando', 'aguardando-voce'].includes(sessao.status)

  // Planos tocados desde o início desta sessão, ou ainda em execução.
  const aoVivo = tarefasAoVivo(sessao.log)
  const inicio = new Date(sessao.iniciada).getTime() - 60_000
  const relevantes = planos.filter(
    (p) => p.status === 'em-execucao' || new Date(p.atualizado ?? p.criado ?? 0).getTime() >= inicio
  )

  useEffect(() => {
    fimLog.current?.scrollIntoView({ block: 'end' })
  }, [sessao.log.length, sessao.pendencias.length, visao])

  const enviar = () => {
    if (!texto.trim()) return
    void window.orch.sessoes.enviar(sessao.id, texto)
    setTexto('')
  }

  return (
    <div className={`sessao ${compacto ? 'compacto' : ''}`}>
      <div className="sessao-principal">
        <div className="seletor-visao">
          <button className={`aba ${visao === 'conversa' ? 'ativa' : ''}`} onClick={() => setVisao('conversa')}>
            Conversa
          </button>
          <button className={`aba ${visao === 'terminal' ? 'ativa' : ''}`} onClick={() => setVisao('terminal')}>
            Terminal
          </button>
        </div>
        {visao === 'terminal' ? (
          <div className="terminal">
            {sessao.log.map((e, i) => (
              <LinhaTerminal key={i} e={e} />
            ))}
            {rodando && sessao.pendencias.length === 0 && <div className="t-acento t-pulso">✻ Trabalhando…</div>}
            {sessao.pendencias.length > 0 && <div className="t-acento">? Aguardando sua resposta abaixo</div>}
            <div ref={fimLog} />
          </div>
        ) : (
          <div className="log">
            {sessao.log.map((e, i) => (
              <Entrada key={i} e={e} />
            ))}
            {rodando && sessao.pendencias.length === 0 && (
              <div className="msg sistema">
                <span className="ponto andamento" /> trabalhando…
              </div>
            )}
            <div ref={fimLog} />
          </div>
        )}

        {sessao.pendencias.length > 0 && (
          <div className="pendencias">
            {sessao.pendencias.map((p) => (
              <CartaoPendencia
                key={p.id}
                p={p}
                aoResponder={(r) => void window.orch.sessoes.responder(sessao.id, p.id, r)}
                aoLiberarTudo={() => void window.orch.sessoes.mudarModo(sessao.id, 'livre')}
              />
            ))}
          </div>
        )}

        {ativa && (
          <div className="barra-modo">
            <label htmlFor="modo-sessao">Permissões</label>
            <select
              id="modo-sessao"
              className="entrada"
              value={sessao.modoPermissao}
              onChange={(e) => void window.orch.sessoes.mudarModo(sessao.id, e.target.value as ModoPermissao)}
            >
              {MODOS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
            <span className="ajuda">{infoModo(sessao.modoPermissao).ajuda}</span>
          </div>
        )}

        {ativa && (
          <div className="compositor">
            <textarea
              className="entrada"
              value={texto}
              placeholder={sessao.status === 'ociosa' ? 'Responder ao Claude (ex.: "pode executar")' : 'Enviar mensagem…'}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  enviar()
                }
              }}
            />
            <button className="botao primario" onClick={enviar} disabled={!texto.trim()}>
              Enviar
            </button>
          </div>
        )}
      </div>

      <aside className="sessao-lateral">
        <div className="secao-titulo">Sessão</div>
        <div style={{ display: 'grid', gap: 6, fontSize: 13, marginBottom: 16 }}>
          <div>
            <Selo rotulo={ROTULO_SESSAO[sessao.status]} />
          </div>
          <div className="muted">
            {nomePasta(sessao.projeto)} · {usd(sessao.custoUsd)}
          </div>
          <div className="linha" style={{ fontSize: 13 }} title={sessao.modelo || undefined}>
            <span className="muted">Modelo</span>
            <span className="selo acento">{nomeModelo(sessao.modelo)}</span>
          </div>
          {sessao.orchCarregado === false && <div className="selo erro">orch não carregado</div>}
          <div className="linha" style={{ flexWrap: 'wrap', marginTop: 4 }}>
            {rodando && (
              <button className="botao pequeno" onClick={() => void window.orch.sessoes.interromper(sessao.id)}>
                Interromper
              </button>
            )}
            {ativa ? (
              <button className="botao pequeno perigo" onClick={() => void window.orch.sessoes.encerrar(sessao.id)}>
                Encerrar
              </button>
            ) : (
              <>
                {aoContinuar && sessao.sessionIdClaude && (
                  <button className="botao pequeno primario" onClick={aoContinuar} title="Retoma a mesma conversa do Claude, com todo o contexto">
                    Continuar conversa
                  </button>
                )}
                <button className="botao pequeno" onClick={aoDescartar}>
                  {aoContinuar ? 'Voltar' : 'Fechar'}
                </button>
              </>
            )}
          </div>
        </div>

        {irmas.length > 0 && aoAbrirSessao && (
          <div className="paralelas">
            <div className="secao-titulo">Tarefas em paralelo</div>
            {irmas.map((x) => {
              const [rotulo, tom] = ROTULO_SESSAO[x.status]
              return (
                <button
                  key={x.id}
                  className={`item-paralela ${x.id === sessao.id ? 'atual' : ''}`}
                  onClick={() => x.id !== sessao.id && aoAbrirSessao(x.id)}
                  title={x.titulo}
                >
                  <span className={`ponto ${tom}`} title={rotulo} />
                  <span className="nome">{x.titulo}</span>
                  <span className="selo acento">{nomeModelo(x.modelo)}</span>
                </button>
              )
            })}
          </div>
        )}

        <PainelContexto sessao={sessao} />

        <div className="secao-titulo">Planos</div>
        {relevantes.length === 0 ? (
          <div className="muted" style={{ fontSize: 12 }}>
            Os planos criados ou executados por esta sessão aparecem aqui.
          </div>
        ) : (
          relevantes.map((p) => <MiniPlano key={p.id} plano={p} aoVivo={aoVivo} aoAbrir={() => aoAbrirPlano(p.id)} />)
        )}
      </aside>
    </div>
  )
}
