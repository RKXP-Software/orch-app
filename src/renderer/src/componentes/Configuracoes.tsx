import { useEffect, useState } from 'react'
import { PainelPlugin } from './AtualizarPlugin'
import { LIMITE_PARALELO } from '@shared/tipos'
import type { Configuracao, Isolamento, MergeWorktree, ModoExecucao, Tema } from '@shared/tipos'

export function Configuracoes({ aoVerTutorial }: { aoVerTutorial: () => void }) {
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
        <label>Tutorial</label>
        <div className="linha">
          <button className="botao" onClick={aoVerTutorial}>
            Ver tutorial
          </button>
          <span className="ajuda">Primeiros passos e como usar o app: execuções, planos, Dashboard e Git.</span>
        </div>
      </div>

      <PainelPlugin />

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
        <label htmlFor="paralelo">Tarefas em paralelo (máximo)</label>
        <input
          id="paralelo"
          type="number"
          className="entrada"
          style={{ width: 90 }}
          min={1}
          max={LIMITE_PARALELO}
          value={c.maxParalelo}
          onChange={(e) => mudar({ maxParalelo: Math.min(LIMITE_PARALELO, Math.max(1, Number(e.target.value) || 1)) })}
        />
        <span className="ajuda">
          De 1 a {LIMITE_PARALELO}. Vale nos dois modos: no manual, o que passar do limite espera numa fila e começa quando
          houver vaga; no automático, o limite é repassado ao orquestrador.
        </span>
      </div>

      <div className="campo">
        <label htmlFor="modo-exec">Execução de planos</label>
        <select
          id="modo-exec"
          className="entrada"
          value={c.modoExecucaoPadrao}
          onChange={(e) => mudar({ modoExecucaoPadrao: e.target.value as ModoExecucao })}
        >
          <option value="automatico">Automático: o orquestrador executa o plano inteiro</option>
          <option value="manual">Manual por ondas: você escolhe as tarefas e o modelo de cada onda</option>
        </select>
        <span className="ajuda">É o modo inicial no detalhe do plano; dá para trocar em cada plano.</span>
      </div>

      <div className="campo">
        <label htmlFor="isolamento">Onde as tarefas trabalham</label>
        <select id="isolamento" className="entrada" value={c.isolamento} onChange={(e) => mudar({ isolamento: e.target.value as Isolamento })}>
          <option value="mesma-pasta">Na pasta do projeto (tarefas paralelas compartilham os arquivos)</option>
          <option value="branch">Num branch do plano (orch/&lt;id do plano&gt;)</option>
          <option value="worktree">Numa worktree por tarefa (só no modo manual)</option>
        </select>
      </div>

      {c.isolamento === 'worktree' && (
        <div className="campo">
          <label htmlFor="merge">Merge das worktrees</label>
          <select id="merge" className="entrada" value={c.mergeWorktree} onChange={(e) => mudar({ mergeWorktree: e.target.value as MergeWorktree })}>
            <option value="manual">Manual: botão Mesclar na tarefa concluída</option>
            <option value="automatico">Automático ao concluir a tarefa</option>
          </select>
          <span className="ajuda">Em caso de conflito o merge é desfeito e a tarefa fica aguardando você.</span>
        </div>
      )}

      <div className="campo">
        <label className="linha" style={{ fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={c.notificacoes}
            onChange={async (e) => {
              const atual = await window.orch.config.ler()
              setC(await window.orch.config.salvar({ ...atual, notificacoes: e.target.checked }))
            }}
          />
          Notificar quando uma execução esperar aprovação ou resposta
        </label>
        <span className="ajuda">
          Notificação do Windows e ícone piscando na barra de tarefas, só quando o app não está em foco. Clicar na
          notificação abre a execução.
        </span>
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
