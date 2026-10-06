import { useState } from 'react'
import { infoModo, MODOS } from '@shared/permissoes'
import type { ModoPermissao, NovaSessao } from '@shared/tipos'
import { CartoesModelo, useModeloInicial } from './SeletorModelo'

interface Acao {
  id: string
  nome: string
  descricao: string
  comando: (texto: string) => string
  rotulo: string
  placeholder: string
  textoObrigatorio: boolean
}

const ACOES: Acao[] = [
  {
    id: 'orquestrar',
    nome: 'Orquestrar',
    descricao: 'Planeja e executa a demanda',
    comando: (t) => `/orch:orquestrar ${t}`,
    rotulo: 'Demanda',
    placeholder: 'Ex.: adicione autenticação JWT na API, com testes e documentação',
    textoObrigatorio: true
  },
  {
    id: 'planejar',
    nome: 'Só planejar',
    descricao: 'Salva os planos sem executar',
    comando: (t) => `/orch:orquestrar --plano ${t}`,
    rotulo: 'Demanda',
    placeholder: 'Ex.: migrar o build para Vite',
    textoObrigatorio: true
  },
  {
    id: 'especializar',
    nome: 'Especializar',
    descricao: 'Perfil e especialistas do projeto',
    comando: (t) => `/orch:especializar ${t}`.trim(),
    rotulo: 'Opções (opcional)',
    placeholder: '--atualizar, --novo ou --so-perfil',
    textoObrigatorio: false
  },
  {
    id: 'criar-agente',
    nome: 'Criar agente',
    descricao: 'Novo agente ou skill',
    comando: (t) => `/orch:criar-agente ${t}`,
    rotulo: 'O que o agente deve fazer',
    placeholder: 'Ex.: especialista em migrações do Prisma',
    textoObrigatorio: true
  },
  {
    id: 'livre',
    nome: 'Prompt livre',
    descricao: 'Qualquer mensagem ao Claude',
    comando: (t) => t,
    rotulo: 'Mensagem',
    placeholder: 'Ex.: /orch:orquestrar --catalogo',
    textoObrigatorio: true
  }
]

export function NovaExecucao({
  projeto,
  aoIniciar
}: {
  projeto: string
  aoIniciar: (n: NovaSessao, onde: 'app' | 'terminal') => void
}) {
  const [modelo, setModelo] = useModeloInicial()
  const [acaoId, setAcaoId] = useState('orquestrar')
  const [texto, setTexto] = useState('')
  const [modo, setModo] = useState<ModoPermissao>('default')
  const acao = ACOES.find((a) => a.id === acaoId)!
  const prompt = acao.comando(texto.trim())
  const valido = !acao.textoObrigatorio || texto.trim() !== ''

  const iniciar = (onde: 'app' | 'terminal' = 'app') => {
    if (!valido) return
    const resumo = texto.trim() ? `: ${texto.trim().slice(0, 50)}` : ''
    aoIniciar({ projeto, prompt, modoPermissao: modo, modelo, titulo: `${acao.nome}${resumo}` }, onde)
    setTexto('')
  }

  return (
    <div className="formulario">
      <div className="campo">
        <label>Ação</label>
        <div className="opcoes-acao">
          {ACOES.map((a) => (
            <button
              key={a.id}
              className={`opcao-acao ${a.id === acaoId ? 'ativa' : ''}`}
              onClick={() => setAcaoId(a.id)}
            >
              <strong>{a.nome}</strong>
              <span>{a.descricao}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="campo">
        <label htmlFor="texto">{acao.rotulo}</label>
        <textarea
          id="texto"
          className="entrada"
          value={texto}
          placeholder={acao.placeholder}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) iniciar('app')
          }}
        />
      </div>

      <div className="campo">
        <label>Modelo do Claude</label>
        <CartoesModelo valor={modelo} aoMudar={setModelo} />
      </div>

      <div className="campo">
        <label htmlFor="modo">Permissões</label>
        <select id="modo" className="entrada" value={modo} onChange={(e) => setModo(e.target.value as ModoPermissao)}>
          {MODOS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </select>
        <span className="ajuda">{infoModo(modo).ajuda} Dá para trocar depois, durante a execução.</span>
      </div>

      <div className="campo">
        <label>Será enviado</label>
        <div className="previa">{prompt || '—'}</div>
      </div>

      <div className="linha">
        <button className="botao primario" disabled={!valido} onClick={() => iniciar('app')}>
          Iniciar no app
        </button>
        <button
          className="botao"
          disabled={!valido}
          onClick={() => iniciar('terminal')}
          title="Abre o Claude Code interativo numa janela de terminal. O progresso dos planos continua aparecendo aqui."
        >
          Abrir no CLI do Claude
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          Ctrl+Enter inicia no app
        </span>
      </div>
    </div>
  )
}
