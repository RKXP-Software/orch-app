import { useState } from 'react'
import { nomeModelo } from '@shared/modelos'
import { LIMITE_PARALELO } from '@shared/tipos'
import type { Plano, Sessao } from '@shared/tipos'
import { ROTULO_SESSAO } from '../util'
import { Selo } from './Selo'
import { TelaSessao } from './Sessao'

const ATIVAS = ['iniciando', 'executando', 'aguardando-voce', 'ociosa']
const RODANDO = ['iniciando', 'executando', 'aguardando-voce']

/** Ativas primeiro (na ordem em que começaram), depois as já terminadas, mais recentes antes. */
function ordenar(sessoes: Sessao[]): Sessao[] {
  const ativas = sessoes.filter((s) => ATIVAS.includes(s.status)).sort((a, b) => a.iniciada.localeCompare(b.iniciada))
  const outras = sessoes.filter((s) => !ATIVAS.includes(s.status)).sort((a, b) => b.iniciada.localeCompare(a.iniciada))
  return [...ativas, ...outras]
}

/** Conversas lado a lado (de 1 a 6 colunas): acompanha as tarefas em paralelo sem sair desta tela. */
export function Paralelo({
  sessoes,
  planos,
  aoAbrirSessao,
  aoAbrirPlano
}: {
  sessoes: Sessao[]
  planos: Plano[]
  aoAbrirSessao: (id: string) => void
  aoAbrirPlano: (id: string) => void
}) {
  const ordem = ordenar(sessoes)
  const ativas = ordem.filter((s) => ATIVAS.includes(s.status)).length
  const [escolhida, setEscolhida] = useState<number | 'auto'>('auto')
  /** Sessão que o usuário fixou em cada coluna. */
  const [fixadas, setFixadas] = useState<Record<number, string>>({})

  const colunas = escolhida === 'auto' ? Math.min(LIMITE_PARALELO, Math.max(1, ativas)) : escolhida

  // Colunas sem escolha recebem, em ordem, as sessões que ainda não aparecem em outra coluna.
  const usadas = new Set(
    Array.from({ length: colunas }, (_, i) => fixadas[i]).filter((id): id is string => !!id && sessoes.some((s) => s.id === id))
  )
  const livres = ordem.filter((s) => !usadas.has(s.id))
  const naColuna: (Sessao | null)[] = []
  for (let i = 0; i < colunas; i++) {
    const fixa = fixadas[i] ? sessoes.find((s) => s.id === fixadas[i]) : undefined
    naColuna.push(fixa ?? livres.shift() ?? null)
  }

  return (
    <div className="paralelo">
      <div className="barra-paralelo">
        <strong>Execuções em paralelo</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          {ativas} ativa{ativas === 1 ? '' : 's'}
        </span>
        <span className="espaco" />
        <span className="muted" style={{ fontSize: 12 }}>
          Colunas
        </span>
        <div className="seletor-tema" role="radiogroup" aria-label="Número de colunas">
          {(['auto', ...Array.from({ length: LIMITE_PARALELO }, (_, i) => i + 1)] as (number | 'auto')[]).map((n) => (
            <button key={n} role="radio" aria-checked={escolhida === n} className={escolhida === n ? 'ativo' : ''} onClick={() => setEscolhida(n)}>
              {n === 'auto' ? 'Auto' : n}
            </button>
          ))}
        </div>
      </div>

      {sessoes.length === 0 ? (
        <div className="vazio">
          <h2>Nenhuma execução neste projeto</h2>
          <p>Execute tarefas de um plano no modo manual (ou inicie uma execução) e acompanhe todas aqui, lado a lado.</p>
        </div>
      ) : (
        <div className="grade-paralela" style={{ ['--colunas' as string]: colunas }}>
          {naColuna.map((s, i) => (
            <div className="coluna-sessao" key={i}>
              <div className="coluna-topo">
                <select
                  className="entrada"
                  value={s?.id ?? ''}
                  onChange={(e) => setFixadas({ ...fixadas, [i]: e.target.value })}
                  aria-label={`Execução da coluna ${i + 1}`}
                >
                  {!s && <option value="">(vazia)</option>}
                  {ordem.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.titulo} · {ROTULO_SESSAO[x.status][0]}
                    </option>
                  ))}
                </select>
                {s && (
                  <>
                    <span className="selo acento" title={s.modelo || undefined}>
                      {nomeModelo(s.modelo)}
                    </span>
                    <Selo rotulo={ROTULO_SESSAO[s.status]} />
                    {RODANDO.includes(s.status) && (
                      <button className="botao pequeno" onClick={() => void window.orch.sessoes.interromper(s.id)}>
                        Interromper
                      </button>
                    )}
                    <button className="botao pequeno" onClick={() => aoAbrirSessao(s.id)} title="Abrir em tela cheia">
                      Abrir
                    </button>
                  </>
                )}
              </div>
              <div className="coluna-corpo">
                {s ? (
                  <TelaSessao sessao={s} planos={planos} aoAbrirPlano={aoAbrirPlano} aoDescartar={() => undefined} compacto />
                ) : (
                  <div className="vazio">
                    <p>Escolha uma execução acima.</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
