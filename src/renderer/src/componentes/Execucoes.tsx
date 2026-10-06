import { useCallback, useEffect, useState } from 'react'
import { nomeModelo } from '@shared/modelos'
import type { ResumoExecucao } from '@shared/tipos'
import { dataHora, ROTULO_SESSAO, usd } from '../util'
import { Selo } from './Selo'

/** Histórico de execuções do projeto, gravadas em .claude/orch/execucoes/. */
export function Execucoes({
  projeto,
  versao,
  aoAbrir,
  aoNova
}: {
  projeto: string
  /** Muda quando alguma execução muda: recarrega a lista. */
  versao: string
  aoAbrir: (e: ResumoExecucao) => void
  aoNova: () => void
}) {
  const [lista, setLista] = useState<ResumoExecucao[] | null>(null)

  const carregar = useCallback(async () => {
    setLista(await window.orch.execucoes.listar(projeto))
  }, [projeto])

  useEffect(() => {
    void carregar()
  }, [carregar, versao])

  useEffect(() => {
    window.addEventListener('focus', carregar)
    return () => window.removeEventListener('focus', carregar)
  }, [carregar])

  if (!lista) return <div className="muted">Lendo as execuções…</div>

  if (lista.length === 0) {
    return (
      <div className="vazio">
        <h2>Nenhuma execução gravada neste projeto</h2>
        <p>
          Cada execução iniciada pelo app fica gravada em <span className="mono">.claude/orch/execucoes/</span>, com a conversa
          completa, e pode ser reaberta e continuada depois.
        </p>
        <button className="botao primario" onClick={aoNova}>
          Nova execução
        </button>
      </div>
    )
  }

  return (
    <div className="lista-execucoes">
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Gravadas em <span className="mono">.claude/orch/execucoes/</span> · {lista.length} execuç{lista.length === 1 ? 'ão' : 'ões'}
      </div>
      {lista.map((e) => (
        <div key={e.arquivo} className="cartao linha-execucao" onClick={() => aoAbrir(e)} role="button" tabIndex={0}>
          <div className="linha-execucao-principal">
            <div className="linha" style={{ gap: 8 }}>
              <strong className="titulo">{e.titulo}</strong>
              {e.idAoVivo && <span className="selo andamento">aberta agora</span>}
            </div>
            <div className="mono muted prompt">{e.prompt}</div>
          </div>
          <div className="linha-execucao-meta">
            <Selo rotulo={ROTULO_SESSAO[e.status]} />
            <span className="selo acento">{nomeModelo(e.modelo)}</span>
            <span className="muted">{dataHora(e.iniciada)}</span>
            <span className="muted">{usd(e.custoUsd)}</span>
            {!e.idAoVivo && (
              <button
                className="botao icone perigo"
                title="Excluir o arquivo desta execução"
                onClick={async (ev) => {
                  ev.stopPropagation()
                  if (!window.confirm(`Excluir a execução "${e.titulo}"?\n\nO arquivo ${e.arquivo} será apagado. Planos e alterações no código não são afetados.`)) return
                  await window.orch.execucoes.excluir(projeto, e.arquivo)
                  await carregar()
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
