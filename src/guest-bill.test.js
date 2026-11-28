import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { billTotals, validBill } from './guest-bill.js'

test('cuenta solo conceptos escogidos y separa IVA de pagos recibidos', () => {
  const items = [
    { included:true, description:'Hospedaje', quantity:2, price:100000, iva:false, rate:19 },
    { included:true, description:'Gaseosas', quantity:3, price:5000, iva:true, rate:19 },
    { included:false, description:'Aseo extra', quantity:1, price:40000, iva:true, rate:19 }
  ]
  assert.equal(validBill(items,50000),true)
  assert.deepEqual(billTotals(items,50000), { subtotal:215000, iva:2850, total:217850, paid:50000, balance:167850 })
})

test('rechaza cuenta vacía, precios negativos y tarifas fuera de rango', () => {
  const item = { included:true, description:'Aseo extra', quantity:1, price:30000, iva:false, rate:19 }
  assert.equal(validBill([{...item,included:false}],0),false)
  assert.equal(validBill([{...item,price:-1}],0),false)
  assert.equal(validBill([{...item,iva:true,rate:120}],0),false)
  assert.equal(validBill([item],-1),false)
})
