import { describe, expect, it } from 'vitest'
import { familiaModelo, nomeModelo } from '@shared/modelos'

describe('nomeModelo', () => {
  it('ids completos viram nomes legíveis', () => {
    expect(nomeModelo('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(nomeModelo('claude-opus-5-5')).toBe('Opus 5.5')
    expect(nomeModelo('claude-fable-5-1[1m]')).toBe('Fable 5.1 (1M)')
  })
  it('aliases e vazio', () => {
    expect(nomeModelo('sonnet')).toBe('Sonnet')
    expect(nomeModelo('')).toBe('Padrão')
    expect(nomeModelo('default')).toBe('Padrão')
  })
})

describe('familiaModelo', () => {
  it('reconhece alias e id', () => {
    expect(familiaModelo('opus')).toBe('opus')
    expect(familiaModelo('claude-fable-5-1[1m]')).toBe('fable')
    expect(familiaModelo('outro')).toBeNull()
  })
})
