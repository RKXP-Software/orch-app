import { useEffect, useState } from 'react'
import { familiaModelo, INDICADO_PARA } from '@shared/modelos'
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

function useModelos(): Modelo[] | null {
  const [modelos, setModelos] = useState<Modelo[] | null>(null)
  useEffect(() => {
    void carregarModelos().then((l) => setModelos(l.filter((m) => m.valor !== 'default')))
  }, [])
  return modelos
}

function Nivel({ n }: { n: number }) {
  return (
    <span className="nivel" aria-label={`capacidade ${n} de 3`}>
      {[1, 2, 3].map((k) => (
        <span key={k} className={k <= n ? 'cheio' : ''} />
      ))}
    </span>
  )
}

/** Cartões com nome, para que serve e nível de capacidade: usado no formulário de nova execução. */
export function CartoesModelo({ valor, aoMudar }: { valor: string; aoMudar: (m: string) => void }) {
  const modelos = useModelos()
  const [verAnteriores, setVerAnteriores] = useState(false)
  if (!modelos) return <div className="muted">Carregando os modelos disponíveis na sua conta…</div>

  // O Claude Code lista o mais recente de cada família primeiro; os demais são versões anteriores.
  const vistas = new Set<string>()
  const todos = modelos.map((m) => {
    const familia = familiaModelo(m.valor)
    const chave = familia ?? m.valor
    const principal = !vistas.has(chave)
    vistas.add(chave)
    return { ...m, familia, principal }
  })
  const anteriores = todos.filter((m) => !m.principal)
  const mostrarAnteriores = verAnteriores || anteriores.some((m) => m.valor === valor)

  const opcoes = [
    { valor: '', nome: 'Padrão', descricao: 'O modelo definido nas suas configurações do Claude Code.', familia: null, principal: true },
    ...todos.filter((m) => m.principal || mostrarAnteriores)
  ]

  return (
    <>
    <div className="cartoes-modelo" role="radiogroup" aria-label="Modelo do Claude">
      {opcoes.map((m) => {
        const info = m.familia ? INDICADO_PARA[m.familia] : null
        const ativo = valor === m.valor
        return (
          <button
            key={m.valor || 'padrao'}
            role="radio"
            aria-checked={ativo}
            className={`cartao-modelo ${ativo ? 'ativo' : ''}`}
            onClick={() => aoMudar(m.valor)}
          >
            <span className="linha" style={{ gap: 6 }}>
              <strong>{m.nome}</strong>
              <span className="espaco" />
              {info && <Nivel n={info.nivel} />}
            </span>
            {info && <span className="selo acento">{info.resumo}</span>}
            <span className="quando">{info?.quando ?? m.descricao}</span>
            {info && m.descricao && <span className="descricao-cli">{m.descricao}</span>}
            {!m.principal && <span className="selo">versão anterior</span>}
          </button>
        )
      })}
    </div>
    {anteriores.length > 0 && !anteriores.some((m) => m.valor === valor) && (
      <button className="link" style={{ fontSize: 12, justifySelf: 'start' }} onClick={() => setVerAnteriores(!verAnteriores)}>
        {verAnteriores ? 'Ocultar versões anteriores' : `Versões anteriores (${anteriores.length})`}
      </button>
    )}
    </>
  )
}

/** Menu compacto (detalhe do plano), com o nome e o resumo de cada modelo. */
export function SeletorModelo({
  valor,
  aoMudar,
  id,
  rotulo = 'Modelo',
  vazio = 'Padrão',
  titulo = 'Modelo do Claude usado nesta execução'
}: {
  valor: string
  aoMudar: (m: string) => void
  id?: string
  /** Texto antes do menu; vazio = só o menu (uso compacto). */
  rotulo?: string
  /** Texto da opção sem modelo escolhido. */
  vazio?: string
  titulo?: string
}) {
  const modelos = useModelos()
  const selecionado = modelos?.find((m) => m.valor === valor)
  return (
    <label className="seletor-modelo" title={titulo}>
      {rotulo && <span>{rotulo}</span>}
      <select id={id} className="entrada" value={valor} disabled={!modelos} onChange={(e) => aoMudar(e.target.value)}>
        {!modelos && <option value={valor}>Carregando…</option>}
        {modelos && <option value="">{vazio}</option>}
        {modelos?.map((m) => {
          const info = INDICADO_PARA[familiaModelo(m.valor) ?? '']
          return (
            <option key={m.valor} value={m.valor}>
              {m.nome}
              {info ? ` · ${info.resumo}` : ''}
            </option>
          )
        })}
        {modelos && valor && !selecionado && <option value={valor}>{valor}</option>}
      </select>
    </label>
  )
}
