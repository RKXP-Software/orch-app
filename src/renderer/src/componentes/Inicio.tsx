import { useState, type ReactNode } from 'react'
import type { Projeto, StatusLogin } from '@shared/tipos'

function Copiavel({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="copiavel">
      <code>{texto}</code>
      <button
        className="botao pequeno"
        onClick={async () => {
          await navigator.clipboard.writeText(texto)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 1500)
        }}
      >
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

function Passo({
  n,
  titulo,
  feito,
  opcional,
  children
}: {
  n: number
  titulo: string
  feito?: boolean
  opcional?: boolean
  children: ReactNode
}) {
  return (
    <li className={`passo ${feito ? 'feito' : ''}`}>
      <span className="passo-num" aria-hidden>
        {feito ? '✓' : n}
      </span>
      <div className="passo-corpo">
        <h3>
          {titulo}
          {opcional && <span className="selo">opcional</span>}
          {feito && <span className="selo ok">feito</span>}
        </h3>
        {children}
      </div>
    </li>
  )
}

export function Inicio({
  login,
  projetos,
  orchCarregado,
  aoFazerLogin,
  aoAdicionarProjeto,
  aoAbrirProjeto,
  aoAbrirConfig
}: {
  login: StatusLogin | null
  projetos: Projeto[]
  /** true se alguma execução já carregou o plugin; null se ainda não se sabe. */
  orchCarregado: boolean | null
  aoFazerLogin: () => void
  aoAdicionarProjeto: () => void
  aoAbrirProjeto: (caminho: string) => void
  aoAbrirConfig: () => void
}) {
  return (
    <div className="inicio">
      <header className="inicio-topo">
        <h1>Bem-vindo ao Orch</h1>
        <p>
          O Orch é a interface do plugin <strong>orch</strong> do Claude Code: você descreve uma demanda, o orquestrador
          quebra em planos com tarefas e dependências, delega cada tarefa a um agente especialista e você acompanha
          tudo por aqui.
        </p>
      </header>

      <section>
        <h2 className="inicio-secao">Primeiros passos</h2>
        <ol className="passos">
          <Passo n={1} titulo="Entre na sua conta do Claude" feito={login?.logado}>
            <p>
              O app usa o Claude Code desta máquina com o login da sua conta Claude (Pro, Max, Team ou Enterprise). O
              login é feito uma única vez, num terminal.
            </p>
            {!login?.logado && (
              <button className="botao primario" onClick={aoFazerLogin}>
                Fazer login
              </button>
            )}
          </Passo>

          <Passo n={2} titulo="Instale o plugin orch" feito={orchCarregado === true}>
            <p>Dentro do Claude Code (terminal ou app desktop), rode:</p>
            <Copiavel texto="/plugin marketplace add RKXP-Software/orch" />
            <Copiavel texto="/plugin install orch@orch-marketplace" />
            <p className="muted">
              Desenvolvendo o plugin? Em vez de instalar, aponte a pasta <span className="mono">plugin/</span> do
              repositório em{' '}
              <button className="link" onClick={aoAbrirConfig}>
                Configurações
              </button>
              . O app confirma o plugin na primeira execução.
            </p>
          </Passo>

          <Passo n={3} titulo="Adicione um projeto" feito={projetos.length > 0}>
            <p>Escolha a pasta do projeto em que o Claude vai trabalhar. Ela aparece na barra lateral.</p>
            <div className="linha" style={{ flexWrap: 'wrap' }}>
              <button className="botao primario" onClick={aoAdicionarProjeto}>
                Adicionar projeto
              </button>
              {projetos.slice(0, 3).map((p) => (
                <button key={p.caminho} className="botao" onClick={() => aoAbrirProjeto(p.caminho)} title={p.caminho}>
                  Abrir {p.nome}
                </button>
              ))}
            </div>
          </Passo>

          <Passo n={4} titulo="Especialize o orch para o projeto" opcional>
            <p>
              Em <strong>Nova execução → Especializar</strong>, o orch analisa o código e gera um perfil (stack,
              comandos, convenções) e agentes especialistas do projeto. Os planos ficam mais precisos. O selo{' '}
              <span className="selo ok">especializado</span> aparece no topo do projeto quando o perfil existe.
            </p>
          </Passo>
        </ol>
      </section>

      <section>
        <h2 className="inicio-secao">Como usar</h2>
        <div className="guia">
          <div className="cartao guia-item">
            <h3>0. Organize no Dashboard</h3>
            <p>
              No <strong>Dashboard</strong>, cada cartão é uma demanda descrita com calma (objetivo, contexto, quando
              está pronta). Quando ela estiver madura, <strong>Planejar…</strong> manda o cartão para o orquestrador, e o
              cartão anda sozinho pelas colunas conforme o plano avança.
            </p>
            <p>
              Nos projetos, as abas <strong>Alterações</strong> e <strong>Git</strong> mostram o que o Claude mudou e
              permitem fazer commit, pull, push e trocar de branch.
            </p>
          </div>

          <div className="cartao guia-item">
            <h3>1. Descreva a demanda</h3>
            <p>
              No projeto, abra <strong>Nova execução</strong> e escolha a ação:
            </p>
            <ul>
              <li>
                <strong>Orquestrar</strong>: planeja e já executa.
              </li>
              <li>
                <strong>Só planejar</strong>: salva os planos para você revisar antes.
              </li>
              <li>
                <strong>Prompt livre</strong>: qualquer mensagem ou comando.
              </li>
            </ul>
            <p>
              Escolha o <strong>modelo</strong> (Opus para planos complexos, Sonnet no dia a dia, Haiku para tarefas
              rápidas) e o modo de <strong>permissões</strong>.
            </p>
          </div>

          <div className="cartao guia-item">
            <h3>2. Rode no app ou no CLI</h3>
            <p>
              <strong>Iniciar no app</strong>: a execução aparece na barra lateral, em <strong>Execuções</strong>.
              Alterne entre <strong>Conversa</strong> (resumo) e <strong>Terminal</strong> (tudo o que o Claude faz,
              com a saída de cada ferramenta, como no CLI).
            </p>
            <p>
              <strong>Abrir no CLI do Claude</strong>: abre o Claude Code interativo numa janela de terminal, com o
              mesmo prompt e modelo. O progresso dos planos continua aparecendo aqui.
            </p>
          </div>

          <div className="cartao guia-item">
            <h3>3. Responda quando pedir</h3>
            <p>
              Quando o Claude precisa de permissão (editar arquivo, rodar comando) ou faz uma pergunta, aparece um
              cartão na execução e o status vira <span className="selo acento">Aguardando você</span>.
            </p>
            <p>
              Cansou de aprovar? Troque o modo em <strong>Permissões</strong>, logo acima da caixa de mensagem, a
              qualquer momento. Em <strong>Sem confirmações</strong> você só responde perguntas de planejamento e a
              aprovação de planos.
            </p>
            <p>
              Se o orquestrador pedir confirmação antes de executar um plano grande, responda na caixa de mensagem
              (ex.: "pode executar").
            </p>
          </div>

          <div className="cartao guia-item">
            <h3>4. Acompanhe os planos</h3>
            <p>
              A aba <strong>Planos</strong> mostra cada plano com as tarefas organizadas em <strong>ondas</strong>{' '}
              (tarefas da mesma onda rodam em paralelo). Os status mudam ao vivo enquanto o orquestrador trabalha.
            </p>
            <p>
              Plano parado no meio? Abra-o e use <strong>Retomar</strong>: as tarefas já concluídas são mantidas.
            </p>
            <p>
              Toda execução fica gravada no projeto. Na aba <strong>Execuções</strong> você reabre qualquer uma e usa{' '}
              <strong>Continuar conversa</strong> para retomar de onde parou.
            </p>
            <p>
              Na lateral da execução, <strong>Contexto</strong> mostra quanto da janela do modelo já está ocupado e
              com o quê (instruções, ferramentas, memória, mensagens).
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="inicio-secao">Status das tarefas</h2>
        <div className="legenda">
          <span>
            <span className="selo">Pendente</span> aguardando dependências
          </span>
          <span>
            <span className="selo acento">Pronta</span> pode começar
          </span>
          <span>
            <span className="selo andamento">Em andamento</span> um agente está trabalhando
          </span>
          <span>
            <span className="selo ok">Concluída</span> entregue e verificada
          </span>
          <span>
            <span className="selo erro">Falhou</span> bloqueia as que dependem dela
          </span>
        </div>
      </section>

      <p className="muted inicio-rodape">
        Dicas: Ctrl+Enter inicia a execução no formulário · o tema (claro/escuro) fica no rodapé da barra lateral ·
        com projetos adicionados, o app abre no <strong>Dashboard</strong>; clique em <strong>Orch</strong>, no topo da
        barra lateral, para voltar a este tutorial.
      </p>
    </div>
  )
}
