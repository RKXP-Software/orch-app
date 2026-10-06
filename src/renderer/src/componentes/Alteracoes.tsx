import { useCallback, useEffect, useState } from 'react'
import type { ArquivoAlterado, EstadoArquivo, LinhaDiff, ResultadoGit, StatusGit } from '@shared/git'

export const LETRA_ESTADO: Record<EstadoArquivo, [string, string, string]> = {
  modificado: ['M', 'andamento', 'Modificado'],
  adicionado: ['A', 'ok', 'Adicionado'],
  removido: ['D', 'erro', 'Removido'],
  renomeado: ['R', 'acento', 'Renomeado'],
  copiado: ['C', 'acento', 'Copiado'],
  'tipo-alterado': ['T', 'andamento', 'Tipo alterado'],
  conflito: ['!', 'erro', 'Conflito'],
  'nao-rastreado': ['U', 'ok', 'Novo (não rastreado)']
}

/** Atualiza o status do git periodicamente e quando a janela volta ao foco. */
export function useStatusGit(projeto: string, intervalo = 4000) {
  const [st, setSt] = useState<StatusGit | null>(null)
  const atualizar = useCallback(async () => {
    setSt(await window.orch.git.status(projeto))
  }, [projeto])

  useEffect(() => {
    setSt(null)
    void atualizar()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void atualizar()
    }, intervalo)
    window.addEventListener('focus', atualizar)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', atualizar)
    }
  }, [atualizar, intervalo])

  return [st, atualizar] as const
}

function partesCaminho(c: string): [string, string] {
  const limpo = c.replace(/\/$/, '')
  const i = limpo.lastIndexOf('/')
  return i < 0 ? [limpo + (c.endsWith('/') ? '/' : ''), ''] : [limpo.slice(i + 1) + (c.endsWith('/') ? '/' : ''), limpo.slice(0, i)]
}

function LinhaArquivo({
  a,
  estado,
  selecionado,
  aoSelecionar,
  acoes
}: {
  a: ArquivoAlterado
  estado: EstadoArquivo
  selecionado: boolean
  aoSelecionar: () => void
  acoes: { rotulo: string; titulo: string; perigo?: boolean; fazer: () => void }[]
}) {
  const [letra, tom, nome] = LETRA_ESTADO[estado]
  const [arquivo, pasta] = partesCaminho(a.caminho)
  return (
    <div className={`arquivo ${selecionado ? 'ativo' : ''}`} onClick={aoSelecionar} title={a.origem ? `${a.origem} → ${a.caminho}` : a.caminho}>
      <span className="arquivo-nome">
        {arquivo}
        {pasta && <span className="muted"> {pasta}</span>}
      </span>
      <span className="arquivo-acoes">
        {acoes.map((x) => (
          <button
            key={x.rotulo}
            className={`botao icone ${x.perigo ? 'perigo' : ''}`}
            title={x.titulo}
            onClick={(e) => {
              e.stopPropagation()
              x.fazer()
            }}
          >
            {x.rotulo}
          </button>
        ))}
      </span>
      <span className={`letra ${tom}`} title={nome}>
        {letra}
      </span>
    </div>
  )
}

export function VisualizadorDiff({ linhas }: { linhas: LinhaDiff[] }) {
  if (linhas.length === 0) return <div className="vazio">Sem diferenças para mostrar.</div>
  return (
    <div className="diff">
      {linhas.map((l, i) =>
        l.tipo === 'cabecalho' ? null : (
          <div key={i} className={`diff-linha d-${l.tipo}`}>
            <span className="num">{l.antiga ?? ''}</span>
            <span className="num">{l.nova ?? ''}</span>
            <span className="sinal">{l.tipo === 'adicionada' ? '+' : l.tipo === 'removida' ? '−' : ''}</span>
            <span className="codigo">{l.texto || ' '}</span>
          </div>
        )
      )}
    </div>
  )
}

export function Alteracoes({ projeto, aoIrParaGit }: { projeto: string; aoIrParaGit: () => void }) {
  const [st, atualizar] = useStatusGit(projeto)
  const [sel, setSel] = useState<{ caminho: string; preparado: boolean } | null>(null)
  const [linhas, setLinhas] = useState<LinhaDiff[] | null>(null)
  const [aviso, setAviso] = useState<ResultadoGit | null>(null)

  const preparados = st?.arquivos.filter((a) => a.indice) ?? []
  const naoPreparados = st?.arquivos.filter((a) => a.arvore) ?? []

  // Seleciona o primeiro arquivo; se o selecionado sumiu da lista, limpa.
  useEffect(() => {
    if (!st) return
    const existe = sel && (sel.preparado ? preparados : naoPreparados).some((a) => a.caminho === sel.caminho)
    if (!existe) {
      const primeiro = naoPreparados[0] ?? preparados[0]
      setSel(primeiro ? { caminho: primeiro.caminho, preparado: !naoPreparados[0] } : null)
    }
  }, [st]) // eslint-disable-line react-hooks/exhaustive-deps

  // Recarrega o diff do arquivo selecionado a cada atualização do status.
  useEffect(() => {
    if (!sel) {
      setLinhas(null)
      return
    }
    let vivo = true
    void window.orch.git.diff(projeto, sel.caminho, sel.preparado).then((l) => vivo && setLinhas(l))
    return () => {
      vivo = false
    }
  }, [projeto, sel, st])

  const executar = async (acao: Promise<ResultadoGit>) => {
    const r = await acao
    setAviso(r.ok ? null : r)
    await atualizar()
  }

  const descartar = (caminhos: string[]) => {
    const novos = caminhos.filter((c) => st?.arquivos.find((a) => a.caminho === c)?.arvore === 'nao-rastreado')
    const texto =
      caminhos.length === 1
        ? `Descartar as alterações em ${caminhos[0]}?${novos.length ? ' O arquivo novo será apagado.' : ''}`
        : `Descartar as alterações em ${caminhos.length} arquivos?${novos.length ? ` ${novos.length} arquivo(s) novo(s) serão apagados.` : ''}`
    if (window.confirm(`${texto}\n\nIsso não pode ser desfeito.`)) void executar(window.orch.git.descartar(projeto, caminhos))
  }

  if (!st) return <div className="muted">Lendo o repositório…</div>

  if (!st.repo) {
    return (
      <div className="vazio">
        <h2>Este projeto não usa git</h2>
        <p>Com um repositório git, o app mostra o que foi alterado e permite fazer commits.</p>
        <button className="botao primario" onClick={() => void executar(window.orch.git.iniciar(projeto))}>
          Iniciar repositório git
        </button>
      </div>
    )
  }

  const sel_ = sel && st.arquivos.find((a) => a.caminho === sel.caminho)
  const estadoSel = sel_ ? (sel!.preparado ? sel_.indice : sel_.arvore) : null

  return (
    <div className="alteracoes">
      <div className="alteracoes-lista">
        {aviso && (
          <div className="msg erro" style={{ marginBottom: 10 }}>
            {aviso.saida}
          </div>
        )}
        {st.arquivos.length === 0 ? (
          <div className="vazio" style={{ padding: '32px 8px' }}>
            <h2>Nada alterado</h2>
            <p>A pasta de trabalho está igual ao último commit{st.branch ? ` de ${st.branch}` : ''}.</p>
          </div>
        ) : (
          <>
            <div className="grupo-titulo">
              <span>Preparadas para commit ({preparados.length})</span>
              {preparados.length > 0 && (
                <button
                  className="botao pequeno"
                  onClick={() => void executar(window.orch.git.tirarDaPreparacao(projeto, preparados.map((a) => a.caminho)))}
                >
                  Tirar todas
                </button>
              )}
            </div>
            {preparados.length === 0 && <div className="muted grupo-vazio">Nenhuma. Use + para preparar.</div>}
            {preparados.map((a) => (
              <LinhaArquivo
                key={`p:${a.caminho}`}
                a={a}
                estado={a.indice!}
                selecionado={sel?.caminho === a.caminho && sel.preparado}
                aoSelecionar={() => setSel({ caminho: a.caminho, preparado: true })}
                acoes={[{ rotulo: '−', titulo: 'Tirar da preparação', fazer: () => void executar(window.orch.git.tirarDaPreparacao(projeto, [a.caminho])) }]}
              />
            ))}

            <div className="grupo-titulo">
              <span>Alterações ({naoPreparados.length})</span>
              {naoPreparados.length > 0 && (
                <span className="linha" style={{ gap: 4 }}>
                  <button className="botao pequeno perigo" onClick={() => descartar(naoPreparados.map((a) => a.caminho))}>
                    Descartar todas
                  </button>
                  <button
                    className="botao pequeno"
                    onClick={() => void executar(window.orch.git.preparar(projeto, naoPreparados.map((a) => a.caminho)))}
                  >
                    Preparar todas
                  </button>
                </span>
              )}
            </div>
            {naoPreparados.length === 0 && <div className="muted grupo-vazio">Nenhuma.</div>}
            {naoPreparados.map((a) => (
              <LinhaArquivo
                key={`a:${a.caminho}`}
                a={a}
                estado={a.arvore!}
                selecionado={sel?.caminho === a.caminho && !sel.preparado}
                aoSelecionar={() => setSel({ caminho: a.caminho, preparado: false })}
                acoes={[
                  { rotulo: '↺', titulo: 'Descartar alterações', perigo: true, fazer: () => descartar([a.caminho]) },
                  { rotulo: '+', titulo: 'Preparar para commit', fazer: () => void executar(window.orch.git.preparar(projeto, [a.caminho])) }
                ]}
              />
            ))}
          </>
        )}
        <div style={{ marginTop: 16 }}>
          <button className="botao primario" style={{ width: '100%' }} onClick={aoIrParaGit} disabled={st.arquivos.length === 0}>
            Fazer commit…
          </button>
        </div>
      </div>

      <div className="alteracoes-diff">
        {sel && sel_ && estadoSel ? (
          <>
            <div className="diff-topo">
              <span className={`letra ${LETRA_ESTADO[estadoSel][1]}`}>{LETRA_ESTADO[estadoSel][0]}</span>
              <span className="mono">{sel_.origem ? `${sel_.origem} → ${sel_.caminho}` : sel_.caminho}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                {LETRA_ESTADO[estadoSel][2]} · {sel.preparado ? 'preparado' : 'não preparado'}
              </span>
              <span className="espaco" />
              <button className="botao pequeno" onClick={() => void window.orch.abrirArquivo(`${projeto}/${sel_.caminho}`)} disabled={estadoSel === 'removido'}>
                Abrir arquivo
              </button>
            </div>
            {linhas ? <VisualizadorDiff linhas={linhas} /> : <div className="muted" style={{ padding: 16 }}>Carregando diff…</div>}
          </>
        ) : (
          <div className="vazio">Selecione um arquivo para ver as diferenças.</div>
        )}
      </div>
    </div>
  )
}
