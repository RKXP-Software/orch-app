import { describe, expect, it } from 'vitest'
import { textoDaPendencia } from '@shared/notificacao'
import type { Sessao } from '@shared/tipos'

const sessao = { projeto: String.raw`F:\proj\MDR`, titulo: 'Orquestrar: login' } as Sessao

describe('textoDaPendencia', () => {
  it('permissão mostra a ação e o projeto', () => {
    const t = textoDaPendencia(sessao, {
      id: '1', tipo: 'permissao', ferramenta: 'Bash', titulo: 'Claude quer usar Bash', detalhe: 'npm test\nmotivo', podeLembrar: false
    })
    expect(t.titulo).toBe('Aprovação pendente em MDR')
    expect(t.corpo).toBe('Claude quer usar Bash\nnpm test')
  })

  it('pergunta mostra a pergunta', () => {
    const t = textoDaPendencia(sessao, {
      id: '2', tipo: 'pergunta', perguntas: [{ question: 'Azul ou verde?', header: 'Cor', multiSelect: false, options: [] }]
    })
    expect(t.titulo).toBe('Pergunta em MDR')
    expect(t.corpo).toContain('Azul ou verde?')
  })

  it('aprovação de plano', () => {
    const t = textoDaPendencia(sessao, {
      id: '3', tipo: 'permissao', ferramenta: 'ExitPlanMode', titulo: 'x', detalhe: 'plano', podeLembrar: false
    })
    expect(t.titulo).toBe('Plano para aprovar em MDR')
  })
})
