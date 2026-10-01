// Montos y monedas, compartidos por Billetera y Lista de deseos.

/** Las monedas que ofrece la app. La base acepta cualquier código de 3 letras. */
export const MONEDAS: Record<string, string> = { HNL: 'Lempiras', USD: 'Dólares' }
const SIMBOLOS: Record<string, string> = { HNL: 'L', USD: 'US$' }
/** "L", "US$" o el código, para otras monedas. */
export const simbolo = (moneda: string) => SIMBOLOS[moneda] ?? moneda

/** El mayor monto que cabe en la base: numeric(12,2). */
const MAXIMO = 9_999_999_999.99

const CON_CENTAVOS = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ENTERO = new Intl.NumberFormat('es-HN', { maximumFractionDigits: 0 })

/** 3450.5 en HNL → "L 3,450.50", con espacio sin corte para que no se separen. Corto: sin ".00" cuando no hay centavos. */
export function dinero(monto: number, moneda: string, corto = false): string {
  const numero = corto && Number.isInteger(monto) ? ENTERO.format(monto) : CON_CENTAVOS.format(monto)
  return `${simbolo(moneda)}\u00a0${numero}`
}

/**
 * Lee lo que se escribe en el campo del monto: "150", "150.50", "1,250.75" o "150,5" (coma decimal,
 * como la pone a veces el teclado del celular). Devuelve null si no es un monto válido para la base.
 */
export function leerMonto(texto: string): number | null {
  let t = texto.replace(/\s/g, '')
  if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.')
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) t = t.replace(/,/g, '')
  if (!/^(\d+(\.\d{1,2})?|\.\d{1,2})$/.test(t)) return null
  const n = Number(t)
  return n > 0 && n <= MAXIMO ? n : null
}
