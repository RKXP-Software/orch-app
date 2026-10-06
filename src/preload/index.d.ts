import type { OrchApi } from '@shared/tipos'

declare global {
  interface Window {
    orch: OrchApi
  }
}

export {}
