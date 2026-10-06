import { useEffect, useState } from 'react'
import type { Modelo } from '@shared/tipos'

let cache: Promise<Modelo[]> | null = null
const carregarModelos = () => (cache ??= window.orch.modelos())

let padraoCache: Promise<string> | null = null
const carregarPadrao = () => (padraoCache ??= window.orch.config.ler().then((c) => c.modeloPadrao))

/** Modelo inicial: o padrão das Configurações (vazio = padrão do Claude Code). */
export function useModeloInicial(): [string, (m: string) => void] {
  const [modelo, setModelo] = useState('')
  useEffect(() => {
    void carregarPadrao().then(setModelo)
  }, [])
  return [modelo, setModelo]
}

export function SeletorModelo({
  valor,
  aoMudar,
  id,
  compacto = false
}: {
  valor: string
  aoMudar: (m: string) => void
  id?: string
  compacto?: boolean
}) {
  const [modelos, setModelos] = useState<Modelo[] | null>(null)

  useEffect(() => {
    void carregarModelos().then(setModelos)
  }, [])

  const selecionado = modelos?.find((m) => m.valor === valor)
  return (
    <>
      <select
        id={id}
        className="entrada"
        style={compacto ? { width: 'auto' } : undefined}
        value={valor}
        disabled={!modelos}
        onChange={(e) => aoMudar(e.target.value)}
        title="Modelo do Claude"
      >
        {!modelos && <option value={valor}>Carregando modelos…</option>}
        {modelos && <option value="">Padrão (recomendado)</option>}
        {modelos?.filter((m) => m.valor !== 'default').map((m) => (
          <option key={m.valor} value={m.valor}>
            {m.nome}
          </option>
        ))}
        {modelos && valor && !selecionado && <option value={valor}>{valor}</option>}
      </select>
      {!compacto && selecionado?.descricao && <span className="ajuda">{selecionado.descricao}</span>}
    </>
  )
}
