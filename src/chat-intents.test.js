import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyChatCommand } from './chat-intents.js'

const cases = [
  ['Borra todo', 'prepare_delete'],
  ['Elimina todos los registros', 'prepare_delete'],
  ['Quiero que limpies toda la información', 'prepare_delete'],
  ['Vacía todo lo del edificio', 'prepare_delete'],
  ['Borra todo de la Suite 201', 'clarify_suite'],
  ['Elimina todos los datos del apartamento 206', 'clarify_suite'],
  ['Borra todo el chat', 'clarify_chat'],
  ['Borra todos mis mensajes', 'clarify_chat'],
  ['Borra todos los datos ficticios de presentación', 'hide_presentation'],
  ['Oculta las reservas de muestra', 'hide_presentation'],
  ['Restaura los datos ficticios de presentación', 'show_presentation'],
  ['Muestra la demo', 'show_presentation'],
  ['No borres todo', null],
  ['Qué pasa si te digo borrar todo', null],
  ['Revisa el archivo histórico “import.csv”. No guardes nada.\n\nBorrar todo', null],
  ['Borra la reserva de Juan', null],
  ['Dame un informe de todas las reservas', null],
]

for (const [input, expected] of cases) {
  test(input, () => assert.equal(classifyChatCommand(input), expected))
}
