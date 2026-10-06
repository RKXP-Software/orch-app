// Notificação do Windows quando uma execução fica esperando aprovação ou resposta do usuário.

import { Notification, type BrowserWindow } from 'electron'
import { textoDaPendencia } from '@shared/notificacao'
import type { Pendencia, Sessao } from '@shared/tipos'

/**
 * Mostra a notificação (só com a janela fora de foco: com ela em foco o cartão já está na tela)
 * e pisca o ícone na barra de tarefas. Clicar leva à execução.
 */
export function notificarPendencia(
  janela: BrowserWindow | null,
  sessao: Sessao,
  p: Pendencia,
  aoClicar: (sessaoId: string) => void
): void {
  if (!janela || janela.isDestroyed() || janela.isFocused()) return
  janela.flashFrame(true)
  if (!Notification.isSupported()) return
  const { titulo, corpo } = textoDaPendencia(sessao, p)
  const n = new Notification({ title: titulo, body: corpo })
  n.on('click', () => {
    if (janela.isDestroyed()) return
    if (janela.isMinimized()) janela.restore()
    janela.show()
    janela.focus()
    aoClicar(sessao.id)
  })
  n.show()
}
