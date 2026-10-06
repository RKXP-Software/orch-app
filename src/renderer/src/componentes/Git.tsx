import { useCallback, useEffect, useState } from 'react'
import type { Branch, Commit, ResultadoGit } from '@shared/git'
import { dataHora } from '../util'
import { useStatusGit } from './Alteracoes'

export function Git({ projeto, aoVerAlteracoes }: { projeto: string; aoVerAlteracoes: () => void }) {
  const [st, atualizarStatus] = useStatusGit(projeto)
  const [branches, setBranches] = useState<Branch[]>([])
  const [log, setLog] = useState<Commit[]>([])
  const [mensagem, setMensagem] = useState('')
  const [incluirTodas, setIncluirTodas] = useState(true)
  const [novoBranch, setNovoBranch] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [saida, setSaida] = useState<(ResultadoGit & { acao: string }) | null>(null)
  const [verRemotas, setVerRemotas] = useState(false)

  const atualizarTudo = useCallback(async () => {
    const [b, l] = await Promise.all([window.orch.git.branches(projeto), window.orch.git.log(projeto)])
    setBranches(b)
    setLog(l)
    await atualizarStatus()
  }, [projeto, atualizarStatus])

  useEffect(() => {
    void atualizarTudo()
  }, [atualizarTudo])

  const preparados = st?.arquivos.filter((a) => a.indice).length ?? 0
  const total = st?.arquivos.length ?? 0

  // Sem nada preparado, o padrão é incluir tudo; com algo preparado, commitar só o preparado.
  useEffect(() => {
    setIncluirTodas(preparados === 0)
  }, [preparados])

  const rodar = async (acao: string, p: Promise<ResultadoGit>, aoDarCerto?: () => void) => {
    setOcupado(acao)
    try {
      const r = await p
      setSaida({ ...r, acao })
      if (r.ok) aoDarCerto?.()
    } finally {
      setOcupado(null)
      await atualizarTudo()
    }
  }

  if (!st) return <div className="muted">Lendo o repositório…</div>
  if (!st.repo) {
    return (
      <div className="vazio">
        <h2>Este projeto não usa git</h2>
        <button className="botao primario" onClick={() => void rodar('Iniciar repositório', window.orch.git.iniciar(projeto))}>
          Iniciar repositório git
        </button>
      </div>
    )
  }

  const locais = branches.filter((b) => !b.remota)
  const remotas = branches.filter((b) => b.remota && !locais.some((l) => l.upstream === b.nome))
  const podeCommitar = !!mensagem.trim() && (incluirTodas ? total > 0 : preparados > 0)

  return (
    <div className="git">
      {saida && (
        <div className={`git-saida ${saida.ok ? 'ok' : 'erro'}`}>
          <div className="linha">
            <strong>{saida.ok ? `${saida.acao}: concluído` : `${saida.acao}: falhou`}</strong>
            <span className="espaco" />
            <button className="botao icone" onClick={() => setSaida(null)} title="Fechar">
              ×
            </button>
          </div>
          {saida.saida && <pre>{saida.saida}</pre>}
        </div>
      )}

      <div className="git-grade">
        <section className="cartao git-cartao">
          <div className="secao-titulo">Branch atual</div>
          <div className="git-branch">
            <span className="mono">{st.destacado ? 'HEAD destacado' : (st.branch ?? '—')}</span>
            {st.upstream ? (
              <span className="muted" style={{ fontSize: 12 }}>
                ↔ {st.upstream}
                {st.aFrente > 0 && <span className="selo acento">↑ {st.aFrente} para enviar</span>}
                {st.atras > 0 && <span className="selo andamento">↓ {st.atras} para baixar</span>}
                {st.aFrente === 0 && st.atras === 0 && <span className="selo ok">sincronizado</span>}
              </span>
            ) : (
              <span className="selo">sem upstream</span>
            )}
          </div>
          <div className="linha" style={{ flexWrap: 'wrap', marginTop: 10 }}>
            <button className="botao" disabled={!!ocupado} onClick={() => void rodar('Fetch', window.orch.git.buscar(projeto))}>
              {ocupado === 'Fetch' ? 'Buscando…' : 'Fetch'}
            </button>
            <button className="botao" disabled={!!ocupado || !st.upstream} onClick={() => void rodar('Pull', window.orch.git.pull(projeto))}>
              {ocupado === 'Pull' ? 'Baixando…' : `Pull${st.atras ? ` (${st.atras})` : ''}`}
            </button>
            <button
              className="botao primario"
              disabled={!!ocupado || st.semCommits || st.destacado}
              onClick={() => void rodar(st.upstream ? 'Push' : 'Publicar branch', window.orch.git.push(projeto))}
            >
              {ocupado === 'Push' || ocupado === 'Publicar branch'
                ? 'Enviando…'
                : st.upstream
                  ? `Push${st.aFrente ? ` (${st.aFrente})` : ''}`
                  : 'Publicar branch'}
            </button>
          </div>
        </section>

        <section className="cartao git-cartao">
          <div className="linha secao-titulo">
            <span>Commit</span>
            <span className="espaco" />
            <button className="link" style={{ fontSize: 12 }} onClick={aoVerAlteracoes}>
              ver alterações ({total})
            </button>
          </div>
          <textarea
            className="entrada"
            placeholder="Mensagem do commit"
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && podeCommitar)
                void rodar('Commit', window.orch.git.commit(projeto, mensagem, incluirTodas), () => setMensagem(''))
            }}
            style={{ minHeight: 72 }}
          />
          <label className="linha" style={{ fontSize: 13, margin: '8px 0' }}>
            <input type="checkbox" checked={incluirTodas} onChange={(e) => setIncluirTodas(e.target.checked)} />
            Incluir todas as alterações ({total} arquivo{total === 1 ? '' : 's'})
            {!incluirTodas && <span className="muted"> · só as preparadas ({preparados})</span>}
          </label>
          <button
            className="botao primario"
            disabled={!podeCommitar || !!ocupado}
            onClick={() => void rodar('Commit', window.orch.git.commit(projeto, mensagem, incluirTodas), () => setMensagem(''))}
          >
            {ocupado === 'Commit' ? 'Fazendo commit…' : `Commit em ${st.branch ?? 'HEAD'}`}
          </button>
          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
            Ctrl+Enter
          </span>
        </section>

        <section className="cartao git-cartao">
          <div className="secao-titulo">Branches</div>
          <div className="linha" style={{ marginBottom: 10 }}>
            <input
              className="entrada"
              placeholder="nome-do-novo-branch"
              value={novoBranch}
              onChange={(e) => setNovoBranch(e.target.value.replace(/\s+/g, '-'))}
            />
            <button
              className="botao"
              disabled={!novoBranch.trim() || !!ocupado}
              onClick={() => void rodar(`Criar ${novoBranch}`, window.orch.git.criarBranch(projeto, novoBranch.trim(), true), () => setNovoBranch(''))}
            >
              Criar e trocar
            </button>
          </div>
          <ul className="git-lista">
            {locais.map((b) => (
              <li key={b.nome} className={b.atual ? 'atual' : ''}>
                <span className={`ponto ${b.atual ? 'ok' : ''}`} />
                <span className="mono nome">{b.nome}</span>
                {b.rastreio && <span className="muted" style={{ fontSize: 11 }}>{b.rastreio}</span>}
                <span className="espaco" />
                {!b.atual && (
                  <>
                    <button
                      className="botao pequeno"
                      disabled={!!ocupado}
                      onClick={() => void rodar(`Trocar para ${b.nome}`, window.orch.git.trocarBranch(projeto, b.nome, false))}
                    >
                      Trocar
                    </button>
                    <button
                      className="botao pequeno perigo"
                      disabled={!!ocupado}
                      title="Apaga só se já estiver integrado (git branch -d)"
                      onClick={() => {
                        if (window.confirm(`Apagar o branch ${b.nome}?\n\nO git recusa se houver commits que ainda não foram integrados.`))
                          void rodar(`Apagar ${b.nome}`, window.orch.git.apagarBranch(projeto, b.nome))
                      }}
                    >
                      Apagar
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {remotas.length > 0 && (
            <>
              <button className="link" style={{ fontSize: 12, marginTop: 8 }} onClick={() => setVerRemotas(!verRemotas)}>
                {verRemotas ? 'Ocultar' : 'Ver'} branches remotos ({remotas.length})
              </button>
              {verRemotas && (
                <ul className="git-lista">
                  {remotas.map((b) => (
                    <li key={b.nome}>
                      <span className="mono nome">{b.nome}</span>
                      <span className="espaco" />
                      <button
                        className="botao pequeno"
                        disabled={!!ocupado}
                        title="Cria o branch local rastreando este remoto"
                        onClick={() => void rodar(`Trocar para ${b.nome}`, window.orch.git.trocarBranch(projeto, b.nome, true))}
                      >
                        Trocar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section className="cartao git-cartao">
          <div className="secao-titulo">Histórico</div>
          {log.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>Nenhum commit ainda.</div>
          ) : (
            <ul className="git-log">
              {log.map((c, n) => (
                <li key={c.hash} title={c.hash}>
                  <span className="mono hash">{c.curto}</span>
                  <span className="assunto">{c.assunto}</span>
                  <span className="muted autor">
                    {c.autor} · {dataHora(c.data)}
                  </span>
                  {n < st.aFrente && <span className="selo acento">não enviado</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
