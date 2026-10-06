// Nomes legíveis e orientação de uso dos modelos do Claude.

/** "claude-haiku-4-5-20251001" → "Haiku 4.5"; "claude-fable-5-1[1m]" → "Fable 5.1 (1M)"; aliases ficam capitalizados. */
export function nomeModelo(id: string | null | undefined): string {
  if (!id) return 'Padrão'
  const longo = /\[1m\]/i.test(id)
  const m = id.replace(/\[1m\]/i, '').match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/i)
  const base = m
    ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
    : id === 'default'
      ? 'Padrão'
      : `${id[0].toUpperCase()}${id.slice(1)}`
  return longo ? `${base} (1M)` : base
}

/** Família do modelo, a partir do alias ou do id. */
export function familiaModelo(id: string): 'opus' | 'sonnet' | 'haiku' | 'fable' | null {
  const f = id.toLowerCase().match(/opus|sonnet|haiku|fable/)?.[0]
  return (f as ReturnType<typeof familiaModelo>) ?? null
}

/** Quando usar cada família (complementa a descrição que o Claude Code devolve). */
export const INDICADO_PARA: Record<string, { resumo: string; quando: string; nivel: 1 | 2 | 3 }> = {
  opus: {
    resumo: 'Mais capaz',
    quando: 'Planos grandes, arquitetura, bugs difíceis e demandas ambíguas.',
    nivel: 3
  },
  fable: {
    resumo: 'Mais capaz',
    quando: 'Trabalhos longos e complexos, com bastante contexto.',
    nivel: 3
  },
  sonnet: {
    resumo: 'Equilíbrio',
    quando: 'O dia a dia: implementar, testar e revisar com boa velocidade.',
    nivel: 2
  },
  haiku: {
    resumo: 'Mais rápido e econômico',
    quando: 'Tarefas simples e diretas, perguntas rápidas e testes.',
    nivel: 1
  }
}
