// Billetera del usuario: ingresos y gastos, desde la tabla billetera de Supabase (docs/base-de-datos.md).
// Las reglas de la base solo le dejan a cada usuario ver, agregar, cambiar y borrar lo suyo, y validan lo
// mismo que la app (monto mayor que 0, categorías, moneda de 3 letras). Se traen los últimos 12 meses.
// La copia en el celular y cuándo se consulta están en useTabla.ts: sin internet se ve lo guardado y
// para anotar hace falta red.
import { supabase } from '../cuenta/supabase.ts'
import { PREFIJOS } from '../guardado.ts'
import { MESES, hoyEnElCelular } from '../mi-dia/formato.ts'
import { esDe, mensajeDeFalla, useTabla, type EstadoTabla } from '../useTabla.ts'

export const CATEGORIAS = {
  comida: 'Comida', transporte: 'Transporte', universidad: 'Universidad', salud: 'Salud', entretenimiento: 'Entretenimiento',
  compras: 'Compras', servicios: 'Servicios', trabajo: 'Trabajo', otro: 'Otro',
} as const
export const TIPOS = { gasto: 'Gasto', ingreso: 'Ingreso' } as const
/** Las monedas que ofrece la app. La base acepta cualquier código de 3 letras. */
export const MONEDAS: Record<string, string> = { HNL: 'Lempiras', USD: 'Dólares' }
const SIMBOLOS: Record<string, string> = { HNL: 'L', USD: 'US$' }
/** "L", "US$" o el código, para otras monedas. */
export const simbolo = (moneda: string) => SIMBOLOS[moneda] ?? moneda
export type Categoria = keyof typeof CATEGORIAS
export type Tipo = keyof typeof TIPOS

export interface Movimiento {
  id: string
  fecha: string
  tipo: Tipo
  monto: number
  moneda: string
  categoria: Categoria
  descripcion: string | null
  creado: string
  actualizado: string
}

export type NuevoMovimiento = Pick<Movimiento, 'fecha' | 'tipo' | 'monto' | 'moneda' | 'categoria' | 'descripcion'>
export type CambiosMovimiento = Partial<NuevoMovimiento>
export type EstadoBilletera = EstadoTabla<Movimiento>

/** Límites: los mismos de la base. El monto es numeric(12,2). */
export const LARGO = { descripcion: 500 } as const
const MAXIMO = 9_999_999_999.99
/** Cuántos meses trae la app, contando el actual. */
export const MESES_VISIBLES = 12

const COLUMNAS = 'id, fecha, tipo, monto, moneda, categoria, descripcion, creado, actualizado'

/** Descarta filas que no tienen la forma esperada (por ejemplo, una copia guardada vieja o dañada). */
function limpiar(v: unknown): Movimiento[] | null {
  if (!Array.isArray(v)) return null
  const lista: Movimiento[] = []
  for (const f of v) {
    if (typeof f !== 'object' || f === null) continue
    // El monto es numeric en la base: por si llega como texto, se pasa a número.
    const monto = Number(f.monto)
    if (typeof f.id === 'string' && typeof f.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha)
      && esDe(TIPOS, f.tipo) && Number.isFinite(monto) && monto > 0
      && typeof f.moneda === 'string' && /^[A-Z]{3}$/.test(f.moneda) && esDe(CATEGORIAS, f.categoria)
      && (f.descripcion === null || typeof f.descripcion === 'string')
      && typeof f.creado === 'string' && typeof f.actualizado === 'string') {
      lista.push({
        id: f.id, fecha: f.fecha, tipo: f.tipo, monto, moneda: f.moneda, categoria: f.categoria,
        descripcion: f.descripcion, creado: f.creado, actualizado: f.actualizado,
      })
    }
  }
  return lista
}

/** "2026-09" → índice de mes corrido, para sumar y restar meses sin fechas de por medio. */
const indice = (mes: string) => Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1
const deIndice = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`

/** Los meses que trae la app, del más viejo al actual: ["2025-10", …, "2026-09"]. */
export function mesesVisibles(hoy = hoyEnElCelular()): string[] {
  const actual = indice(hoy.slice(0, 7))
  return Array.from({ length: MESES_VISIBLES }, (_, i) => deIndice(actual - MESES_VISIBLES + 1 + i))
}

function consultar(senal: AbortSignal) {
  return supabase
    .from('billetera')
    .select(COLUMNAS)
    .gte('fecha', `${mesesVisibles()[0]}-01`)
    .order('fecha', { ascending: false })
    .order('creado', { ascending: false })
    .abortSignal(senal)
}

export function useBilletera(usuario: string) {
  const { estado, actualizar, recargar } = useTabla(PREFIJOS.billetera + usuario, consultar, limpiar)

  /** Anota un movimiento. Devuelve el id para poder deshacerlo, o un mensaje si no se pudo. */
  async function agregar(nuevo: NuevoMovimiento): Promise<{ id: string } | { mensaje: string }> {
    if (!navigator.onLine) return { mensaje: mensajeDeFalla() }
    const { data, error } = await supabase.from('billetera').insert(nuevo).select(COLUMNAS).single()
    const fila = error ? null : limpiar([data])?.[0]
    if (!fila) return { mensaje: mensajeDeFalla() }
    actualizar((lista) => [fila, ...lista])
    return { id: fila.id }
  }

  /**
   * Cambia un movimiento. Se ve el cambio al instante y, si Supabase no lo acepta, vuelve a como estaba.
   * Devuelve un mensaje si no se pudo, o null si salió bien.
   */
  async function cambiar(original: Movimiento, cambios: CambiosMovimiento): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { id } = original
    actualizar((lista) => lista.map((m) => (m.id === id ? { ...m, ...cambios } : m)))
    const { data, error } = await supabase.from('billetera').update(cambios).eq('id', id).select(COLUMNAS).single()
    const fila = error ? null : limpiar([data])?.[0]
    actualizar((lista) => lista.map((m) => (m.id === id ? fila ?? original : m)))
    return fila ? null : mensajeDeFalla()
  }

  /** Borra un movimiento. Devuelve un mensaje si no se pudo, o null si salió bien. */
  async function borrar(id: string): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { error } = await supabase.from('billetera').delete().eq('id', id)
    if (error) return mensajeDeFalla()
    actualizar((lista) => lista.filter((m) => m.id !== id))
    return null
  }

  return { estado, agregar, cambiar, borrar, recargar }
}

// ---------- montos ----------

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

/** Las sumas van en centavos enteros, para que 0.1 + 0.2 no dé 0.30000000000000004. */
const centavos = (n: number) => Math.round(n * 100)

// ---------- resumen del mes ----------

export interface ResumenMoneda {
  moneda: string
  gastos: number
  ingresos: number
  /** Gastos por categoría, de mayor a menor, con su parte del total (0 a 1). */
  categorias: { categoria: Categoria; monto: number; parte: number }[]
}

/** El resumen de un mes ("2026-09"), una entrada por moneda: lempiras primero. No se convierte entre monedas. */
export function resumirMes(lista: Movimiento[], mes: string): ResumenMoneda[] {
  const porMoneda = new Map<string, { gastos: number; ingresos: number; categorias: Map<Categoria, number> }>()
  for (const m of lista) {
    if (!m.fecha.startsWith(mes)) continue
    const r = porMoneda.get(m.moneda) ?? { gastos: 0, ingresos: 0, categorias: new Map() }
    if (m.tipo === 'ingreso') r.ingresos += centavos(m.monto)
    else {
      r.gastos += centavos(m.monto)
      r.categorias.set(m.categoria, (r.categorias.get(m.categoria) ?? 0) + centavos(m.monto))
    }
    porMoneda.set(m.moneda, r)
  }
  return [...porMoneda.entries()]
    .sort(([a], [b]) => (a === 'HNL' ? -1 : b === 'HNL' ? 1 : a.localeCompare(b)))
    .map(([moneda, r]) => ({
      moneda,
      gastos: r.gastos / 100,
      ingresos: r.ingresos / 100,
      categorias: [...r.categorias.entries()]
        .sort(([, a], [, b]) => b - a)
        .map(([categoria, c]) => ({ categoria, monto: c / 100, parte: r.gastos ? c / r.gastos : 0 })),
    }))
}

/** "L 3,450 y US$ 20": los gastos (o ingresos) de cada moneda, juntos. Null si no hay ninguno. */
export function totalEnPalabras(resumen: ResumenMoneda[], cual: 'gastos' | 'ingresos'): string | null {
  const partes = resumen.filter((r) => r[cual] > 0).map((r) => dinero(r[cual], r.moneda, true))
  if (!partes.length) return null
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`
}

/** "septiembre", o "diciembre de 2025" si no es del año de hoy. */
export function nombreDelMes(mes: string, hoy = hoyEnElCelular()): string {
  const nombre = MESES[Number(mes.slice(5, 7)) - 1]
  return mes.slice(0, 4) === hoy.slice(0, 4) ? nombre : `${nombre} de ${mes.slice(0, 4)}`
}

/** Los movimientos de un mes agrupados por día, del más reciente al más viejo. */
export function porDia(lista: Movimiento[], mes: string): { fecha: string; movimientos: Movimiento[] }[] {
  const dias = new Map<string, Movimiento[]>()
  const delMes = lista.filter((m) => m.fecha.startsWith(mes))
    .sort((a, b) => (a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : a.creado < b.creado ? 1 : -1))
  for (const m of delMes) dias.set(m.fecha, [...(dias.get(m.fecha) ?? []), m])
  return [...dias.entries()].map(([fecha, movimientos]) => ({ fecha, movimientos }))
}
