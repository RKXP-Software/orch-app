import { progresso, tarefasProntas } from '@shared/plano'
import type { Plano, Tarefa } from '@shared/tipos'
import { dataHora, ROTULO_PLANO, ROTULO_TAREFA } from '../util'
import { Progresso, Selo } from './Selo'
import { SeletorModelo, useModeloInicial } from './SeletorModelo'

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

function CartaoTarefa({ t, pronta }: { t: Tarefa; pronta: boolean }) {
  const classe = t.status === 'pendente' && pronta ? 'pronta' : t.status
  return (
    <div className={`cartao tarefa ${classe}`}>
      <div className="linha">
        <span className="mono">{t.id}</span>
        <span className="espaco" />
        <Selo rotulo={t.status === 'pendente' && pronta ? ['Pronta', 'acento'] : ROTULO_TAREFA[t.status]} />
      </div>
      <div className="titulo">{t.titulo}</div>
      <div className="executor">{t.executor}</div>
      {t.dependeDe.length > 0 && <div className="detalhe">Depende de {t.dependeDe.join(', ')}</div>}
      {t.arquivos.length > 0 && <div className="detalhe mono">{t.arquivos.join(', ')}</div>}
      {t.resultado && <div className="detalhe">{t.resultado}</div>}
    </div>
  )
}

export function DetalhePlano({
  plano,
  ocupado,
  aoVoltar,
  aoExecutar
}: {
  plano: Plano
  ocupado: boolean
  aoVoltar: () => void
  aoExecutar: (p: Plano, modelo: string, onde: 'app' | 'terminal') => void
}) {
  const [modelo, setModelo] = useModeloInicial()
  const { feitas, total, pct } = progresso(plano)
  const prontas = new Set(tarefasProntas(plano))
  const porId = new Map(plano.tarefas.map((t) => [t.id, t]))
  const podeExecutar = plano.status !== 'concluido' && plano.status !== 'cancelado'

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
        <div className="linha">
          {plano.arquivoMd && (
            <button className="botao" onClick={() => window.orch.abrirArquivo(plano.arquivoMd!)}>
              Abrir .md
            </button>
          )}
          {podeExecutar && (
            <>
              <SeletorModelo valor={modelo} aoMudar={setModelo} compacto />
              <button className="botao" onClick={() => aoExecutar(plano, modelo, 'terminal')} title="Executar no CLI do Claude">
                No CLI
              </button>
              <button className="botao primario" disabled={ocupado} onClick={() => aoExecutar(plano, modelo, 'app')}>
                {plano.status === 'planejado' ? 'Executar' : 'Retomar'}
              </button>
            </>
          )}
        </div>
      </div>

      {plano.origem === 'md' && (
        <div className="aviso">
          Plano criado por uma versão do orch anterior à 0.4.0: o estado foi lido do .md e pode estar incompleto.
        </div>
      )}

      <div className="ondas">
        {plano.ondas.map((onda, n) => (
          <div className="onda" key={n}>
            <div className="onda-titulo">Onda {n + 1}</div>
            {onda.map((id) => {
              const t = porId.get(id)
              return t ? <CartaoTarefa key={id} t={t} pronta={prontas.has(id)} /> : null
            })}
          </div>
        ))}
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
