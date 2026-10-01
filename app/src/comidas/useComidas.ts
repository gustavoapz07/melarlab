// Comidas del usuario, desde la tabla comidas de Supabase (docs/base-de-datos.md). El plan y el registro van
// en la misma tabla: lo anotado para un día que todavía no llega es el plan; para hoy o antes, lo que se comió.
// La app guarda una comida por momento del día (desayuno, almuerzo, merienda y cena). Se traen 30 días para
// atrás y 30 para adelante. La copia en el celular y cuándo se consulta están en useTabla.ts.
import { supabase } from '../cuenta/supabase.ts'
import { PREFIJOS } from '../guardado.ts'
import { hoyEnElCelular, sumarDiasISO } from '../mi-dia/formato.ts'
import { esDe, mensajeDeFalla, useTabla, type EstadoTabla } from '../useTabla.ts'

/** En el orden del día (la base las tiene en otro orden; aquí manda el reloj). */
export const MOMENTOS = { desayuno: 'Desayuno', almuerzo: 'Almuerzo', merienda: 'Merienda', cena: 'Cena' } as const
export type Momento = keyof typeof MOMENTOS
export const LISTA_MOMENTOS = Object.keys(MOMENTOS) as Momento[]
export const LARGO = { comida: 500, notas: 2000 } as const
/** Hasta cuántos días para adelante se puede planear. */
export const DIAS_DE_PLAN = 30

export interface Comida {
  id: string
  fecha: string
  momento: Momento
  comida: string
  casera: boolean
  notas: string | null
  creado: string
  actualizado: string
}

export type NuevaComida = Pick<Comida, 'fecha' | 'momento' | 'comida' | 'casera' | 'notas'>
export type EstadoComidas = EstadoTabla<Comida>

const COLUMNAS = 'id, fecha, momento, comida, casera, notas, creado, actualizado'

function limpiar(v: unknown): Comida[] | null {
  if (!Array.isArray(v)) return null
  return v.filter((f): f is Comida => typeof f === 'object' && f !== null
    && typeof f.id === 'string' && typeof f.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha)
    && esDe(MOMENTOS, f.momento) && typeof f.comida === 'string' && typeof f.casera === 'boolean'
    && (f.notas === null || typeof f.notas === 'string')
    && typeof f.creado === 'string' && typeof f.actualizado === 'string')
}

function consultar(senal: AbortSignal) {
  const hoy = hoyEnElCelular()
  return supabase
    .from('comidas')
    .select(COLUMNAS)
    .gte('fecha', sumarDiasISO(hoy, -30))
    .lte('fecha', sumarDiasISO(hoy, DIAS_DE_PLAN))
    .order('fecha', { ascending: true })
    .order('creado', { ascending: true })
    .abortSignal(senal)
}

export function useComidas(usuario: string) {
  const { estado, actualizar, recargar } = useTabla(PREFIJOS.comidas + usuario, consultar, limpiar)

  /** Anota una comida. Devuelve el id para poder deshacerlo, o un mensaje si no se pudo. */
  async function agregar(nueva: NuevaComida): Promise<{ id: string } | { mensaje: string }> {
    if (!navigator.onLine) return { mensaje: mensajeDeFalla() }
    const { data, error } = await supabase.from('comidas').insert(nueva).select(COLUMNAS).single()
    const fila = error ? null : limpiar([data])?.[0]
    if (!fila) return { mensaje: mensajeDeFalla() }
    actualizar((lista) => [...lista, fila])
    return { id: fila.id }
  }

  /** Cambia una comida: se ve al instante y, si Supabase no lo acepta, vuelve a como estaba. */
  async function cambiar(original: Comida, cambios: Partial<NuevaComida>): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { id } = original
    actualizar((lista) => lista.map((c) => (c.id === id ? { ...c, ...cambios } : c)))
    const { data, error } = await supabase.from('comidas').update(cambios).eq('id', id).select(COLUMNAS).single()
    const fila = error ? null : limpiar([data])?.[0]
    actualizar((lista) => lista.map((c) => (c.id === id ? fila ?? original : c)))
    return fila ? null : mensajeDeFalla()
  }

  async function borrar(id: string): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { error } = await supabase.from('comidas').delete().eq('id', id)
    if (error) return mensajeDeFalla()
    actualizar((lista) => lista.filter((c) => c.id !== id))
    return null
  }

  return { estado, agregar, cambiar, borrar, recargar }
}

// ---------- el día y la semana ----------

/** El momento que toca según la hora: antes de las 10:30, desayuno; antes de las 15, almuerzo; antes de las 18, merienda; después, cena. */
export function momentoDeAhora(ahora = new Date()): Momento {
  const m = ahora.getHours() * 60 + ahora.getMinutes()
  if (m < 10 * 60 + 30) return 'desayuno'
  if (m < 15 * 60) return 'almuerzo'
  if (m < 18 * 60) return 'merienda'
  return 'cena'
}

/** La comida de un día y un momento: si hubiera dos, la más reciente. */
export function comidaDe(lista: Comida[], fecha: string, momento: Momento): Comida | undefined {
  return lista.filter((c) => c.fecha === fecha && c.momento === momento).sort((a, b) => (a.creado < b.creado ? 1 : -1))[0]
}

/** Las comidas de un día, en el orden del día. */
export function delDia(lista: Comida[], fecha: string): Comida[] {
  return LISTA_MOMENTOS.map((m) => comidaDe(lista, fecha, m)).filter((c): c is Comida => Boolean(c))
}

/** Cuántas de las comidas de los últimos 7 días (hoy incluido) fueron hechas en casa. */
export function caseras(lista: Comida[], hoy = hoyEnElCelular()): { caseras: number; total: number } {
  const desde = sumarDiasISO(hoy, -6)
  const semana = lista.filter((c) => c.fecha >= desde && c.fecha <= hoy)
  return { caseras: semana.filter((c) => c.casera).length, total: semana.length }
}

/** "almuerzo, pollo con arroz; cena, sopa de frijoles" */
export function enPalabras(comidas: Comida[]): string {
  return comidas.map((c) => `${MOMENTOS[c.momento].toLowerCase()}, ${c.comida}`).join('; ')
}
