import { useState } from 'react'
import { Plus } from 'lucide-react'

const COP = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n)
const labels = { snack:'Confitería / minibar', cleaning:'Aseo adicional', other:'Otro cargo' }

export default function GuestCharges({ booking, charges, db, refresh, notify }) {
  const [kind,setKind] = useState('snack')
  const [description,setDescription] = useState('')
  const [quantity,setQuantity] = useState('1')
  const [price,setPrice] = useState('')
  const [busy,setBusy] = useState(false)
  const canEdit = !booking.is_demo && ['confirmed','checked_in'].includes(booking.status)
  const active = charges.filter(row => row.booking_id === booking.id && !row.voided_at)
  const save = async event => {
    event.preventDefault()
    if (!canEdit || busy) return
    setBusy(true)
    const {error} = await db.from('guest_charges').insert({booking_id:booking.id,kind,description:description.trim(),quantity:Number(quantity),unit_price:Number(price)})
    if (error) notify('No se pudo registrar el consumo. Revisa los datos y que la reserva siga abierta.')
    else { setDescription(''); setQuantity('1'); setPrice(''); notify('Consumo agregado a la cuenta del huésped.'); await refresh() }
    setBusy(false)
  }
  const voidCharge = async row => {
    if (!canEdit || busy || !window.confirm(`¿Anular ${row.description}? El cargo quedará en el historial y no saldrá en la cuenta.`)) return
    setBusy(true)
    const {data:{session}} = await db.auth.getSession()
    const {error} = await db.from('guest_charges').update({voided_at:new Date().toISOString(),voided_by:session?.user?.id}).eq('id',row.id).is('voided_at',null)
    notify(error ? 'No se pudo anular el consumo.' : 'Consumo anulado; no se cobrará al huésped.')
    if (!error) await refresh()
    setBusy(false)
  }
  return <section className="guest-charges"><div className="booking-history-heading"><h3>Consumos del huésped</h3><span>{active.length}</span></div>
    {active.length ? active.map(row=><div className="guest-charge-row" key={row.id}><span><b>{row.description}</b><small>{labels[row.kind]} · {row.quantity} × {COP(row.unit_price)}</small></span><b>{COP(row.quantity*row.unit_price)}</b>{canEdit&&<button type="button" className="text-button" disabled={busy} onClick={()=>voidCharge(row)}>Anular</button>}</div>) : <p className="muted">Aún no hay consumos adicionales en esta reserva.</p>}
    {canEdit&&<form className="guest-charge-form" onSubmit={save}><label className="field-label">Tipo<select value={kind} onChange={event=>setKind(event.target.value)}>{Object.entries(labels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><label className="field-label">Producto o servicio<input value={description} onChange={event=>setDescription(event.target.value)} maxLength="160" required placeholder="Ej. Gaseosa, papitas, aseo extra"/></label><label className="field-label">Cantidad<input type="number" min="1" max="1000" step="1" value={quantity} onChange={event=>setQuantity(event.target.value)} required/></label><label className="field-label">Precio unitario<input type="number" min="1" max="100000000" step="1" value={price} onChange={event=>setPrice(event.target.value)} required/></label><button type="submit" className="secondary-btn" disabled={busy}><Plus size={15}/>{busy?'Guardando…':'Agregar consumo'}</button></form>}
    {booking.is_demo&&<p className="settings-hint">Las reservas de muestra no guardan consumos reales.</p>}
    {!canEdit&&!booking.is_demo&&<p className="settings-hint">La estancia está finalizada; sus consumos quedaron cerrados para la cuenta de salida.</p>}
  </section>
}
