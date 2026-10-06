import { describe, expect, it } from 'vitest'
import { aprovaSozinho, MODOS, modoDoSdk } from '@shared/permissoes'

describe('aprovaSozinho', () => {
  it('sem confirmações aprova tudo, menos perguntas e aprovação de plano', () => {
    expect(aprovaSozinho('livre', 'Bash')).toBe(true)
    expect(aprovaSozinho('livre', 'Write')).toBe(true)
    expect(aprovaSozinho('livre', 'mcp__qualquer__ferramenta')).toBe(true)
    expect(aprovaSozinho('livre', 'AskUserQuestion')).toBe(false)
    expect(aprovaSozinho('livre', 'ExitPlanMode')).toBe(false)
  })

  it('aceitar edições aprova só edição de arquivo', () => {
    expect(aprovaSozinho('acceptEdits', 'Edit')).toBe(true)
    expect(aprovaSozinho('acceptEdits', 'Bash')).toBe(false)
  })

  it('perguntar, automático e somente leitura nunca aprovam sozinhos no app', () => {
    for (const modo of ['default', 'auto', 'plan'] as const) {
      expect(aprovaSozinho(modo, 'Bash')).toBe(false)
      expect(aprovaSozinho(modo, 'Edit')).toBe(false)
    }
  })
})

describe('modoDoSdk', () => {
  it('nunca usa o bypassPermissions do SDK', () => {
    for (const m of MODOS) expect(modoDoSdk(m.id)).not.toBe('bypassPermissions')
    expect(modoDoSdk('livre')).toBe('acceptEdits')
  })
})
