import { useEffect, useState } from 'react'
import type { Configuracao, Tema } from '@shared/tipos'

export function Configuracoes() {
  const [c, setC] = useState<Configuracao | null>(null)
  const [salvo, setSalvo] = useState(false)

  useEffect(() => {
    void window.orch.config.ler().then(setC)
  }, [])

  if (!c) return null

  const mudar = (parcial: Partial<Configuracao>) => {
    setC({ ...c, ...parcial })
    setSalvo(false)
  }

  return (
    <div className="formulario">
      <div className="campo">
        <label htmlFor="plugin">Pasta do plugin orch (opcional)</label>
        <div className="linha">
          <input
            id="plugin"
            className="entrada"
            value={c.pluginLocal}
            placeholder="Vazio = usar o orch instalado no Claude Code"
            onChange={(e) => mudar({ pluginLocal: e.target.value })}
          />
          <button
            className="botao"
            onClick={async () => {
              const p = await window.orch.config.escolherPasta()
              if (p) mudar({ pluginLocal: p })
            }}
          >
            Escolher…
          </button>
        </div>
        <span className="ajuda">
          Para testar uma versão local do plugin: aponte para a pasta <span className="mono">plugin/</span> do repositório
          orch (a que contém <span className="mono">.claude-plugin/plugin.json</span>).
        </span>
      </div>

      <div className="campo">
        <label htmlFor="exe">Executável do Claude Code (opcional)</label>
        <input
          id="exe"
          className="entrada"
          value={c.executavelClaude}
          placeholder="Vazio = o embutido no app"
          onChange={(e) => mudar({ executavelClaude: e.target.value })}
        />
        <span className="ajuda">
          O app usa o login do Claude Code desta máquina. Se ainda não fez login, rode <span className="mono">claude</span>{' '}
          num terminal uma vez.
        </span>
      </div>

      <div className="campo">
        <label htmlFor="modelo">Modelo (opcional)</label>
        <input
          id="modelo"
          className="entrada"
          value={c.modeloPadrao}
          placeholder="Vazio = o padrão das suas configurações do Claude Code"
          onChange={(e) => mudar({ modeloPadrao: e.target.value })}
        />
      </div>

      <div className="campo">
        <label htmlFor="tema">Tema</label>
        <select
          id="tema"
          className="entrada"
          value={c.tema}
          onChange={async (e) => {
            const tema = e.target.value as Tema
            setC(await window.orch.config.definirTema(tema))
          }}
        >
          <option value="sistema">Seguir o Windows</option>
          <option value="claro">Claro</option>
          <option value="escuro">Escuro</option>
        </select>
        <span className="ajuda">Muda na hora. Também dá para trocar pelo rodapé da barra lateral.</span>
      </div>

      <div className="linha">
        <button
          className="botao primario"
          onClick={async () => {
            const atual = await window.orch.config.ler()
            setC(await window.orch.config.salvar({ ...c, tema: atual.tema }))
            setSalvo(true)
          }}
        >
          Salvar
        </button>
        {salvo && <span className="muted">Salvo. Vale para as próximas execuções.</span>}
      </div>
    </div>
  )
}
