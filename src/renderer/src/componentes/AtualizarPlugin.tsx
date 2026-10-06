import { useCallback, useEffect, useState } from 'react'
import type { ResultadoAtualizacaoPlugin, StatusPlugin } from '@shared/tipos'

function usePlugin() {
  const [status, setStatus] = useState<StatusPlugin | null>(null)
  const [atualizando, setAtualizando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoAtualizacaoPlugin | null>(null)

  const consultar = useCallback(() => {
    void window.orch.plugin.status().then(setStatus)
  }, [])

  useEffect(() => {
    consultar()
  }, [consultar])

  const atualizar = async () => {
    setAtualizando(true)
    setResultado(null)
    try {
      setResultado(await window.orch.plugin.atualizar())
    } catch (e) {
      setResultado({ ok: false, versaoAntes: null, versaoDepois: null, mensagem: e instanceof Error ? e.message : String(e) })
    } finally {
      setAtualizando(false)
      consultar()
    }
  }

  return { status, atualizando, resultado, atualizar }
}

function resumo(r: ResultadoAtualizacaoPlugin): string {
  if (!r.ok) return 'Não foi possível atualizar.'
  if (r.versaoAntes && r.versaoDepois && r.versaoAntes !== r.versaoDepois) return `Atualizado: ${r.versaoAntes} → ${r.versaoDepois}. Vale para as próximas execuções.`
  return `Já está na versão mais recente${r.versaoDepois ? ` (${r.versaoDepois})` : ''}.`
}

/** Atalho da barra lateral. */
export function AtalhoAtualizarPlugin() {
  const { status, atualizando, resultado, atualizar } = usePlugin()
  return (
    <>
      <button
        className="item"
        disabled={atualizando}
        onClick={() => void atualizar()}
        title="Atualiza o plugin orch instalado no Claude Code para a versão mais recente do marketplace"
      >
        <span className="nome">
          {atualizando ? 'Atualizando plugin…' : 'Atualizar plugin'}
          <div className="sub">{status?.versao ? `orch ${status.versao}` : status && !status.instalado ? 'orch não instalado' : ' '}</div>
        </span>
      </button>
      {resultado && (
        <div className="muted" role="status" style={{ fontSize: 11, padding: '0 10px 6px', whiteSpace: 'pre-wrap' }} title={resultado.mensagem}>
          {resumo(resultado)}
        </div>
      )}
    </>
  )
}

/** Painel completo das Configurações. */
export function PainelPlugin() {
  const { status, atualizando, resultado, atualizar } = usePlugin()
  return (
    <div className="campo">
      <label>Plugin orch</label>
      <div className="linha">
        <button className="botao" disabled={atualizando || (status !== null && !status.instalado)} onClick={() => void atualizar()}>
          {atualizando ? 'Atualizando…' : 'Atualizar plugin'}
        </button>
        <span className="muted">
          {!status
            ? 'Consultando…'
            : status.instalado
              ? `Instalado: ${status.id} · versão ${status.versao ?? '?'}`
              : (status.erro ?? 'Não instalado no Claude Code.')}
        </span>
      </div>
      {status?.usaPastaLocal && (
        <span className="ajuda">
          Há uma pasta local do plugin configurada abaixo: ela tem prioridade sobre a instalação, então atualizar não muda o que as execuções usam.
        </span>
      )}
      {resultado && (
        <div className={`aviso ${resultado.ok ? '' : 'erro'}`} role="status" style={{ whiteSpace: 'pre-wrap' }}>
          <strong>{resumo(resultado)}</strong>
          {resultado.mensagem && `\n${resultado.mensagem}`}
        </div>
      )}
      <span className="ajuda">
        Baixa a versão mais nova do marketplace. Execuções já abertas continuam com a versão antiga; inicie uma nova para usar a atualizada.
      </span>
    </div>
  )
}
