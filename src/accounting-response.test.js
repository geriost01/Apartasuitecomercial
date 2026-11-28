import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

const source = readFileSync(fileURLToPath(new URL('../supabase/functions/accounting-assistant/index.ts', import.meta.url)), 'utf8')
const responseLogic = source.slice(source.indexOf('function normalizeModelDraft('), source.indexOf('async function commitDraft('))
const javascript = transformSync(responseLogic, { loader: 'ts' }).code
const parseModelJson = vm.runInNewContext(`${javascript}\nparseModelJson`)

test('un lote válido conserva la tarjeta de revisión', () => {
  const row = { apartment: '201', guest_name: 'Ana Pérez', guests: 2, arrival: '2026-12-01', departure: '2026-12-03', nightly_rate: 120000, channel: 'Directa' }
  const result = parseModelJson(JSON.stringify({ reply: 'Revisa esta reserva.', draft: { type: 'booking_batch', bookings: [row] } }))
  assert.equal(result.draft.bookings[0].apartment, '201')
  assert.equal(result.draft.bookings[0].nightly_rate, 120000)
})

test('una fila nula no rompe la vista previa', () => {
  const result = parseModelJson(JSON.stringify({ reply: 'Faltan datos.', draft: { type: 'booking_batch', bookings: [null] } }))
  assert.equal(result.draft, null)
})

test('un lote vacío o de más de 30 filas no muestra confirmación', () => {
  for (const bookings of [[], Array.from({ length: 31 }, () => ({}))]) {
    assert.equal(parseModelJson(JSON.stringify({ reply: 'Revisar.', draft: { type: 'booking_batch', bookings } })).draft, null)
  }
})

test('una acción desconocida no presenta un botón para guardar', () => {
  const result = parseModelJson(JSON.stringify({ reply: 'No disponible.', draft: { type: 'delete_all' } }))
  assert.equal(result.draft, null)
})

test('una respuesta en prosa sigue siendo legible sin tarjeta de guardado', () => {
  const result = parseModelJson('En la información disponible no hay pagos registrados.')
  assert.match(result.reply, /no hay pagos/)
  assert.equal(result.draft, null)
})
