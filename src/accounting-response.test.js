import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

const source = readFileSync(fileURLToPath(new URL('../supabase/functions/accounting-assistant/index.ts', import.meta.url)), 'utf8')
const dateLogic = source.slice(source.indexOf('const isIsoDate ='), source.indexOf('async function authorized('))
const responseLogic = dateLogic + source.slice(source.indexOf('function normalizeModelDraft('), source.indexOf('async function commitDraft('))
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

test('una reserva sin fecha o tarifa no se ofrece para confirmar', () => {
  const incomplete = { apartment: '201', guest_name: 'Ana Pérez', guests: 2, arrival: '2026-12-01', departure: '2026-12-03', channel: 'Directa' }
  for (const draft of [incomplete, { ...incomplete, nightly_rate: 120000, departure: '2026-11-30' }]) {
    const result = parseModelJson(JSON.stringify({ reply: 'Falta revisar la reserva.', draft: { type: 'booking_batch', bookings: [draft] } }))
    assert.equal(result.draft, null)
  }
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

test('un consumo del huésped es un cargo separado y exige precio y huésped', () => {
  const charge = { type: 'guest_charge', apartment: '201', guest_name: 'Ana Pérez', description: 'Gaseosa', kind: 'snack', quantity: 2, unit_price: 5000 }
  assert.equal(parseModelJson(JSON.stringify({ reply: 'Revisa el cargo.', draft: charge })).draft.type, 'guest_charge')
  assert.equal(parseModelJson(JSON.stringify({ reply: 'Falta precio.', draft: { ...charge, unit_price: undefined } })).draft, null)
  assert.equal(parseModelJson(JSON.stringify({ reply: 'Falta huésped.', draft: { ...charge, guest_name: undefined } })).draft, null)
})

test('una respuesta en prosa sigue siendo legible sin tarjeta de guardado', () => {
  const result = parseModelJson('En la información disponible no hay pagos registrados.')
  assert.match(result.reply, /no hay pagos/)
  assert.equal(result.draft, null)
})
