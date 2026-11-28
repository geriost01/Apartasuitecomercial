const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export function classifyChatCommand(text) {
  const value = normalize(text)
  if (!value || value.startsWith('revisa el archivo historico')) return null
  if (/^(que pasa|que pasaria|como funciona|explicame|si te digo|supongamos)\b/.test(value)) return null
  if (/\b(no|nunca|sin)\s+(?:quiero\s+que\s+)?(?:borr|elimin|limpi|vaci|formate)/.test(value)) return null

  const presentation = /\b(fictici\w*|demo|presentacion|muestra\w*)\b/.test(value)
  const destructive = /\b(borr\w*|elimin\w*|limpi\w*|vaci\w*|formate\w*)\b/.test(value)
  const hide = /\b(ocult\w*|escond\w*|quit\w*)\b/.test(value)
  const restore = /\b(muestr\w*|mostr\w*|activ\w*|restaur\w*)\b/.test(value)
  if (presentation && (destructive || hide) && /\b(reserva\w*|ocupacion|historial|dato\w*|muestra\w*)\b/.test(value)) return 'hide_presentation'
  if (presentation && restore) return 'show_presentation'

  const all = /\b(todo\w*|toda\s+la\s+informacion|base\s+completa)\b/.test(value)
  if (!destructive || !all) return null
  if (/\b(chat|conversacion|mensaje\w*)\b/.test(value)) return /\b(reserva\w*|edificio|contab\w*|financier\w*)\b/.test(value) ? 'clarify_chat' : 'clear_chat'
  if (/\b(suite|apartamento|apto)\s*#?\s*\d{2,4}\b/.test(value)) return 'clarify_suite'
  return 'prepare_delete'
}
