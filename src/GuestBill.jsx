import { useState } from 'react'
import { Download, FileText, Plus, Printer, X } from 'lucide-react'
import { billTotals, validBill } from './guest-bill.js'

const COP = n => new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 }).format(n)
const date = value => value ? new Intl.DateTimeFormat('es-CO', { day:'numeric', month:'long', year:'numeric' }).format(new Date(`${value}T12:00:00`)) : '—'
const makeItem = (description = '', price = 0) => ({ id:crypto.randomUUID(), included:true, description, quantity:1, price, iva:false, rate:19 })
const stayItem = booking => makeItem(`Hospedaje suite ${booking.unit} · ${booking.arrival} al ${booking.departure}`, Number(booking.amount || 0))
const paidFor = (booking, ledger) => ledger.filter(row => row.booking_id === booking.id && ['receipt','refund'].includes(row.kind)).reduce((sum,row) => sum + (row.kind === 'receipt' ? 1 : -1) * Number(row.amount || 0) * (row.reversal_of ? -1 : 1), 0)

export default function GuestBill({ bookings, ledger, apartments, initialBooking, onClose }) {
  const getUnit = id => apartments.find(unit => unit.id === id)?.label || '—'
  const [bookingId,setBookingId] = useState(initialBooking?.id || '')
  const [name,setName] = useState(initialBooking?.guest_name || '')
  const [documentId,setDocumentId] = useState('')
  const [items,setItems] = useState(initialBooking ? [stayItem({...initialBooking,unit:getUnit(initialBooking.apartment_id)})] : [makeItem()])
  const [error,setError] = useState('')
  const booking = bookings.find(row => row.id === bookingId)
  const paid = booking ? Math.max(0,paidFor(booking,ledger)) : 0
  const totals = billTotals(items,paid)
  const demo = Boolean(booking?.is_demo)
  const chooseBooking = id => {
    const next = bookings.find(row => row.id === id)
    setBookingId(id)
    setName(next?.guest_name || '')
    setItems(next ? [stayItem({...next,unit:getUnit(next.apartment_id)})] : [makeItem()])
    setError('')
  }
  const update = (id, key, value) => setItems(list => list.map(item => item.id === id ? {...item,[key]:value} : item))
  const add = kind => setItems(list => [...list,makeItem(kind === 'snack' ? 'Consumo de minibar / confitería' : kind === 'cleaning' ? 'Aseo adicional' : '')])
  const generate = async mode => {
    if (!name.trim() || !validBill(items,paid)) { setError('Escribe el cliente y revisa conceptos, cantidades, valores e IVA. Selecciona al menos un concepto con valor.'); return }
    setError('')
    // Open while the click still has user activation; browsers block delayed popups.
    const printWindow = mode === 'print' ? window.open('', '_blank') : null
    const {default:jsPDF} = await import('jspdf')
    const doc = new jsPDF(), selected = items.filter(item => item.included)
    doc.setFillColor(39,68,60); doc.rect(0,0,210,38,'F')
    doc.setTextColor(255,255,255); doc.setFontSize(17); doc.text('APARTA SUITE LA FLORA',16,17)
    doc.setFontSize(10); doc.text(demo ? 'MUESTRA · CUENTA PARA HUESPED' : 'CUENTA DETALLADA PARA HUESPED',16,27)
    doc.setTextColor(39,47,43); doc.setFontSize(13); doc.text('Detalle de consumos',16,51)
    doc.setFontSize(9); doc.text(`Fecha: ${date(new Date().toISOString().slice(0,10))}`,16,62)
    doc.text(`Cliente: ${name.trim().slice(0,100)}`,16,69,{maxWidth:175})
    if (documentId.trim()) doc.text(`Documento: ${documentId.trim().slice(0,35)}`,16,77)
    let y = documentId.trim() ? 88 : 80
    if (booking) { doc.text(`Suite ${getUnit(booking.apartment_id)} · ${date(booking.arrival)} al ${date(booking.departure)}`,16,y,{maxWidth:178}); y += 12 }
    doc.setFont('helvetica','bold'); doc.text('CONCEPTO',16,y); doc.text('CANT.',123,y,{align:'right'}); doc.text('UNITARIO',157,y,{align:'right'}); doc.text('TOTAL',194,y,{align:'right'}); doc.setFont('helvetica','normal'); y += 5
    doc.setDrawColor(220,225,219); doc.line(16,y,194,y); y += 9
    for (const item of selected) {
      if (y > 254) { doc.addPage(); y = 22 }
      const amount = Number(item.quantity)*Number(item.price), tax = item.iva ? Math.round(amount*Number(item.rate)/100) : 0
      const lines = doc.splitTextToSize(item.description.trim(),93)
      doc.text(lines,16,y); doc.text(String(item.quantity),123,y,{align:'right'}); doc.text(COP(Number(item.price)),157,y,{align:'right'}); doc.text(COP(amount),194,y,{align:'right'})
      y += Math.max(7,lines.length*5)
      if (item.iva) { doc.setTextColor(100,106,98); doc.setFontSize(8); doc.text(`IVA ${item.rate}%: ${COP(tax)}`,16,y); doc.setFontSize(9); doc.setTextColor(39,47,43); y += 7 }
      y += 5
    }
    if (y > 236) { doc.addPage(); y = 22 }
    doc.line(16,y,194,y); y += 10
    for (const [label,value] of [['Subtotal',totals.subtotal],['IVA seleccionado',totals.iva],['Total',totals.total],['Pagos registrados de la reserva',totals.paid],['Saldo de esta cuenta',totals.balance]]) {
      if (!booking && label === 'Pagos registrados de la reserva') continue
      doc.setFont('helvetica',label === 'Total' || label === 'Saldo de esta cuenta' ? 'bold':'normal')
      doc.text(label,16,y); doc.text(COP(value),194,y,{align:'right'}); y += 9
    }
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(143,78,59)
    if (y > 259) { doc.addPage(); y = 22 }
    doc.text('Cuenta informativa. No es factura electronica ni reemplaza el documento validado por la DIAN.',16,y+7,{maxWidth:178})
    if (demo) doc.text('DATOS FICTICIOS DE PRESENTACION · SIN VALIDEZ FISCAL',16,y+16)
    const fileName = `cuenta-huesped-${(booking ? getUnit(booking.apartment_id) : name.trim()).replace(/[^\w-]/g,'-')}.pdf`
    if (mode === 'download') doc.save(fileName)
    else {
      doc.autoPrint()
      const url = URL.createObjectURL(doc.output('blob'))
      if (printWindow) printWindow.location.href = url
      else { doc.save(fileName); setError('El navegador bloqueó la ventana de impresión; se descargó el PDF para imprimirlo.') }
      setTimeout(() => URL.revokeObjectURL(url), 120000)
    }
  }
  return <div className="modal-scrim" onMouseDown={onClose}><section className="modal-card guest-bill-modal" onMouseDown={event=>event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Cuenta para el huésped">
    <div className="modal-head"><div><h2>Cuenta para el huésped</h2><p>Escoge solo lo que vas a cobrar. Abre el PDF para imprimirlo.</p></div><button className="icon-btn" aria-label="Cerrar" onClick={onClose}><X size={18}/></button></div>
    <p className="guest-bill-notice">Este PDF es una cuenta informativa. Para entregar una factura electrónica fiscal se requiere emitirla y validarla ante la DIAN.</p>
    <div className="guest-bill-fields"><label className="field-label">Reserva (opcional)<select value={bookingId} onChange={event=>chooseBooking(event.target.value)}><option value="">Cuenta sin reserva</option>{bookings.filter(row=>!['cancelled','blocked'].includes(row.status)).map(row=><option key={row.id} value={row.id}>Suite {getUnit(row.apartment_id)} · {row.guest_name} · {row.arrival}</option>)}</select></label><label className="field-label">Cliente<input value={name} onChange={event=>setName(event.target.value)} maxLength="100" placeholder="Nombre o razón social" required/></label><label className="field-label">Documento del cliente (opcional)<input value={documentId} onChange={event=>setDocumentId(event.target.value)} maxLength="35" placeholder="Cédula o NIT"/></label></div>
    <div className="guest-bill-items"><h3>Conceptos a incluir</h3>{items.map(item=><div className="guest-bill-item" key={item.id}><label className="guest-bill-check"><input type="checkbox" checked={item.included} onChange={event=>update(item.id,'included',event.target.checked)}/> Incluir</label><label className="field-label guest-bill-description">Concepto<input value={item.description} maxLength="160" onChange={event=>update(item.id,'description',event.target.value)} placeholder="Hospedaje, gaseosa, aseo extra..."/></label><label className="field-label">Cantidad<input type="number" min="1" max="1000" step="1" value={item.quantity} onChange={event=>update(item.id,'quantity',event.target.value)}/></label><label className="field-label">Valor unitario antes de IVA<input type="number" min="0" step="1" value={item.price} onChange={event=>update(item.id,'price',event.target.value)}/></label><label className="guest-bill-check"><input type="checkbox" checked={item.iva} onChange={event=>update(item.id,'iva',event.target.checked)}/> Cobrar IVA</label>{item.iva&&<label className="field-label">Tarifa IVA (%)<input type="number" min="0" max="100" step="0.01" value={item.rate} onChange={event=>update(item.id,'rate',event.target.value)}/></label>}<b>{COP(Number(item.quantity||0)*Number(item.price||0) + (item.iva ? Math.round(Number(item.quantity||0)*Number(item.price||0)*Number(item.rate||0)/100) : 0))}</b><button type="button" className="icon-btn" aria-label={`Quitar ${item.description||'concepto'}`} onClick={()=>setItems(list=>list.filter(row=>row.id!==item.id))}><X size={15}/></button></div>)}</div>
    <div className="guest-bill-add"><button className="secondary-btn" onClick={()=>add('snack')}><Plus size={15}/> Confitería</button><button className="secondary-btn" onClick={()=>add('cleaning')}><Plus size={15}/> Aseo extra</button><button className="secondary-btn" onClick={()=>add('other')}><Plus size={15}/> Otro concepto</button></div>
    <div className="guest-bill-summary"><span>Subtotal <b>{COP(totals.subtotal)}</b></span><span>IVA elegido <b>{COP(totals.iva)}</b></span><span>Total <b>{COP(totals.total)}</b></span>{booking&&<><span>Pagos registrados <b>{COP(totals.paid)}</b></span><span>Saldo de esta cuenta <b>{COP(totals.balance)}</b></span></>}</div>
    {booking&&<p className="settings-hint">Los pagos se toman de la reserva. Los consumos y el IVA de esta cuenta no se registran automáticamente como ingreso ni modifican la reserva.</p>}
    {demo&&<p className="guest-bill-notice">Esta reserva es ficticia; el PDF llevará marca de muestra.</p>}{error&&<p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="secondary-btn" onClick={()=>generate('download')}><Download size={16}/> Descargar PDF</button><button className="primary-btn" onClick={()=>generate('print')}><Printer size={16}/> Abrir para imprimir</button></div>
  </section></div>
}
