// Lista de deseos del usuario, desde la tabla lista_deseos de Supabase (docs/base-de-datos.md): lo que quiero
// comprar, con su precio y el precio al que lo compraría. Las reglas de la base solo le dejan a cada usuario
// ver y cambiar lo suyo, y validan lo mismo que la app (enlaces solo https, precios de 0 o más). El precio se
// actualiza a mano; revisarlo solo en las tiendas queda para después (ver Decisiones en la bóveda).
import { supabase } from '../cuenta/supabase.ts'
import { dinero } from '../dinero.ts'
import { PREFIJOS } from '../guardado.ts'
import { esDe, mensajeDeFalla, useTabla, type EstadoTabla } from '../useTabla.ts'

export const PRIORIDADES = { alta: 'Alta', media: 'Media', baja: 'Baja' } as const
export const ESTADOS = { quiero: 'Lo quiero', comprado: 'Comprado', descartado: 'Descartado' } as const
export type Prioridad = keyof typeof PRIORIDADES
export type EstadoDeseo = keyof typeof ESTADOS
export const LARGO = { producto: 200, enlace: 2000, notas: 2000 } as const

export interface Deseo {
  id: string
  producto: string
  enlace: string | null
  precio: number | null
  precio_objetivo: number | null
  moneda: string
  prioridad: Prioridad
  estado: EstadoDeseo
  notas: string | null
  creado: string
  actualizado: string
}

export type NuevoDeseo = Pick<Deseo, 'producto' | 'enlace' | 'precio' | 'precio_objetivo' | 'moneda' | 'prioridad' | 'notas'>
export type CambiosDeseo = Partial<Pick<Deseo, 'producto' | 'enlace' | 'precio' | 'precio_objetivo' | 'moneda' | 'prioridad' | 'estado' | 'notas'>>
export type EstadoDeseos = EstadoTabla<Deseo>

const COLUMNAS = 'id, producto, enlace, precio, precio_objetivo, moneda, prioridad, estado, notas, creado, actualizado'

/** Los precios son numeric en la base: por si llegan como texto, se pasan a número. */
const precio = (v: unknown): number | null | undefined => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function limpiar(v: unknown): Deseo[] | null {
  if (!Array.isArray(v)) return null
  const lista: Deseo[] = []
  for (const f of v) {
    if (typeof f !== 'object' || f === null) continue
    const p = precio(f.precio)
    const o = precio(f.precio_objetivo)
    if (typeof f.id === 'string' && typeof f.producto === 'string' && p !== undefined && o !== undefined
      && (f.enlace === null || (typeof f.enlace === 'string' && f.enlace.startsWith('https://')))
      && typeof f.moneda === 'string' && /^[A-Z]{3}$/.test(f.moneda) && esDe(PRIORIDADES, f.prioridad) && esDe(ESTADOS, f.estado)
      && (f.notas === null || typeof f.notas === 'string') && typeof f.creado === 'string' && typeof f.actualizado === 'string') {
      lista.push({ ...f, precio: p, precio_objetivo: o })
    }
  }
  return lista
}

function consultar(senal: AbortSignal) {
  return supabase.from('lista_deseos').select(COLUMNAS).order('creado', { ascending: true }).abortSignal(senal)
}

export function useDeseos(usuario: string) {
  const { estado, actualizar, recargar } = useTabla(PREFIJOS.deseos + usuario, consultar, limpiar)

  /** Agrega un producto. Devuelve un mensaje si no se pudo, o null si salió bien. */
  async function agregar(nuevo: NuevoDeseo): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { data, error } = await supabase.from('lista_deseos').insert(nuevo).select(COLUMNAS).single()
    const fila = error ? null : limpiar([data])?.[0]
    if (!fila) return mensajeDeFalla()
    actualizar((lista) => [...lista, fila])
    return null
  }

  /** Cambia un producto: se ve al instante y, si Supabase no lo acepta, vuelve a como estaba. */
  async function cambiar(original: Deseo, cambios: CambiosDeseo): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { id } = original
    actualizar((lista) => lista.map((d) => (d.id === id ? { ...d, ...cambios } : d)))
    const { data, error } = await supabase.from('lista_deseos').update(cambios).eq('id', id).select(COLUMNAS).single()
    const fila = error ? null : limpiar([data])?.[0]
    actualizar((lista) => lista.map((d) => (d.id === id ? fila ?? original : d)))
    return fila ? null : mensajeDeFalla()
  }

  async function borrar(id: string): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { error } = await supabase.from('lista_deseos').delete().eq('id', id)
    if (error) return mensajeDeFalla()
    actualizar((lista) => lista.filter((d) => d.id !== id))
    return null
  }

  return { estado, agregar, cambiar, borrar, recargar }
}

// ---------- precios ----------

/** Llegó al precio que quiero pagar (o más abajo). */
export const aSuPrecio = (d: Deseo) => d.estado === 'quiero' && d.precio !== null && d.precio_objetivo !== null && d.precio <= d.precio_objetivo

const PESO: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 }

export interface Grupos {
  aSuPrecio: Deseo[]
  quiero: Deseo[]
  comprados: Deseo[]
  descartados: Deseo[]
}

/** Los que llegaron a su precio, los que quiero (por prioridad), y lo comprado y descartado (lo último primero). */
export function agrupar(lista: Deseo[]): Grupos {
  const recientes = (a: Deseo, b: Deseo) => (a.actualizado < b.actualizado ? 1 : -1)
  return {
    aSuPrecio: lista.filter(aSuPrecio),
    quiero: lista.filter((d) => d.estado === 'quiero' && !aSuPrecio(d)).sort((a, b) => PESO[a.prioridad] - PESO[b.prioridad] || (a.creado < b.creado ? -1 : 1)),
    comprados: lista.filter((d) => d.estado === 'comprado').sort(recientes),
    descartados: lista.filter((d) => d.estado === 'descartado').sort(recientes),
  }
}

/** Lo que cuesta comprar todo lo que quiero, por moneda: al precio de hoy y al que quiero pagar (o al de hoy, si ya es menor). */
export function totales(lista: Deseo[]): { moneda: string; hoy: number; objetivo: number; sinPrecio: number }[] {
  const porMoneda = new Map<string, { hoy: number; objetivo: number; sinPrecio: number }>()
  for (const d of lista.filter((x) => x.estado === 'quiero')) {
    const t = porMoneda.get(d.moneda) ?? { hoy: 0, objetivo: 0, sinPrecio: 0 }
    if (d.precio === null) t.sinPrecio++
    else {
      t.hoy += Math.round(d.precio * 100)
      t.objetivo += Math.round(Math.min(d.precio, d.precio_objetivo ?? d.precio) * 100)
    }
    porMoneda.set(d.moneda, t)
  }
  return [...porMoneda.entries()]
    .sort(([a], [b]) => (a === 'HNL' ? -1 : b === 'HNL' ? 1 : a.localeCompare(b)))
    .map(([moneda, t]) => ({ moneda, hoy: t.hoy / 100, objetivo: t.objetivo / 100, sinPrecio: t.sinPrecio }))
}

/** "https://tienda.com/x" si sirve para la base, null si va vacío; undefined si no sirve (no es https). */
export function leerEnlace(texto: string): string | null | undefined {
  const t = texto.trim()
  if (!t) return null
  return /^https:\/\/\S+$/i.test(t) && t.length <= LARGO.enlace ? t : undefined
}

/** El dominio, para mostrar el enlace corto: "tienda.com". */
export function dominio(enlace: string): string {
  try {
    return new URL(enlace).hostname.replace(/^www\./, '')
  } catch {
    return enlace
  }
}

/** Para Mi Día: "Audífonos llegó a tu precio: L 900." o "2 cosas llegaron a tu precio: Audífonos y Teclado." Null si nada. */
export function lineaDeDeseos(lista: Deseo[]): string | null {
  const llegaron = lista.filter(aSuPrecio)
  if (!llegaron.length) return null
  if (llegaron.length === 1) {
    const d = llegaron[0]
    return `${d.producto} llegó a tu precio: ${dinero(d.precio ?? 0, d.moneda)}.`
  }
  const nombres = llegaron.map((d) => d.producto)
  return `${llegaron.length} cosas llegaron a tu precio: ${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}.`
}
