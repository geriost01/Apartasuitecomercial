export const billTotals = (items, paid = 0) => {
  const selected = items.filter(item => item.included)
  const subtotal = selected.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0)
  const iva = selected.reduce((sum, item) => sum + (item.iva ? Math.round(Number(item.quantity) * Number(item.price) * Number(item.rate) / 100) : 0), 0)
  const total = subtotal + iva
  return { subtotal, iva, total, paid: Number(paid), balance: total - Number(paid) }
}

export const validBill = (items, paid) => {
  const selected = items.filter(item => item.included)
  return selected.length > 0 && selected.every(item =>
    item.description.trim().length > 0 && item.description.length <= 160 &&
    Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0 && Number(item.quantity) <= 1000 &&
    Number.isSafeInteger(Number(item.price)) && Number(item.price) >= 0 &&
    (!item.iva || (Number.isFinite(Number(item.rate)) && Number(item.rate) >= 0 && Number(item.rate) <= 100))
  ) && Number.isSafeInteger(billTotals(items, paid).total) && billTotals(items, paid).total > 0 && Number.isSafeInteger(Number(paid)) && Number(paid) >= 0
}
