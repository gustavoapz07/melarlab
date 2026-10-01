// Descanso del usuario: una fila por noche, desde la tabla descanso de Supabase (docs/base-de-datos.md).
// La noche lleva la fecha del día en que se despertó. Las horas dormidas las calcula la base (cruzan la
// medianoche: de 23:30 a 06:00 da 6.50). Se traen los últimos 60 días. La copia en el celular y cuándo
// se consulta están en useTabla.ts: sin internet se ve lo guardado y para anotar hace falta red.
import { supabase } from '../cuenta/supabase.ts'
import { PREFIJOS } from '../guardado.ts'
import { hoyEnElCelular, sumarDiasISO } from '../mi-dia/formato.ts'
import { mensajeDeFalla, useTabla, type EstadoTabla } from '../useTabla.ts'

/** Horas que conviene dormir. Fija por ahora; se podrá cambiar cuando haga falta (ver Decisiones en la bóveda). */
export const META_HORAS = 7
/** Desde cuántas noches cortas seguidas se avisa. */
export const NOCHES_PARA_AVISAR = 3
export const CALIDADES: Record<number, string> = { 1: 'Muy mal', 2: 'Mal', 3: 'Regular', 4: 'Bien', 5: 'Muy bien' }
export const LARGO = { notas: 2000 } as const
const DIAS_VISIBLES = 60

export interface Noche {
  id: string
  /** El día en que se despertó: la noche del domingo al lunes lleva la fecha del lunes. */
  fecha: string
  /** "23:30" */
  me_dormi: string
  me_desperte: string
  horas: number
  calidad: number | null
  notas: string | null
  creado: string
  actualizado: string
}

export type NuevaNoche = Pick<Noche, 'fecha' | 'me_dormi' | 'me_desperte' | 'calidad' | 'notas'>
export type EstadoDescanso = EstadoTabla<Noche>

const COLUMNAS = 'id, fecha, me_dormi, me_desperte, horas_dormidas, calidad, notas, creado, actualizado'
const HORA = /^([01]\d|2[0-3]):[0-5]\d(:\d\d)?$/

/** Descarta filas que no tienen la forma esperada (por ejemplo, una copia guardada vieja o dañada). */
function limpiar(v: unknown): Noche[] | null {
  if (!Array.isArray(v)) return null
  const lista: Noche[] = []
  for (const f of v) {
    if (typeof f !== 'object' || f === null) continue
    // horas_dormidas es numeric en la base (y "horas" en la copia guardada): por si llega como texto, se pasa a número.
    const horas = Number(f.horas_dormidas ?? f.horas)
    if (typeof f.id === 'string' && typeof f.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha)
      && typeof f.me_dormi === 'string' && HORA.test(f.me_dormi) && typeof f.me_desperte === 'string' && HORA.test(f.me_desperte)
      && Number.isFinite(horas) && (f.calidad === null || (Number.isInteger(f.calidad) && f.calidad >= 1 && f.calidad <= 5))
      && (f.notas === null || typeof f.notas === 'string')
      && typeof f.creado === 'string' && typeof f.actualizado === 'string') {
      lista.push({
        id: f.id, fecha: f.fecha, me_dormi: f.me_dormi.slice(0, 5), me_desperte: f.me_desperte.slice(0, 5), horas,
        calidad: f.calidad, notas: f.notas, creado: f.creado, actualizado: f.actualizado,
      })
    }
  }
  return lista
}

function consultar(senal: AbortSignal) {
  return supabase
    .from('descanso')
    .select(COLUMNAS)
    .gte('fecha', sumarDiasISO(hoyEnElCelular(), -(DIAS_VISIBLES - 1)))
    .order('fecha', { ascending: false })
    .order('creado', { ascending: false })
    .abortSignal(senal)
}

export function useDescanso(usuario: string) {
  const { estado, actualizar, recargar } = useTabla(PREFIJOS.descanso + usuario, consultar, limpiar)

  /** Anota una noche. Devuelve el id para poder deshacerlo, o un mensaje si no se pudo. */
  async function agregar(nueva: NuevaNoche): Promise<{ id: string } | { mensaje: string }> {
    if (!navigator.onLine) return { mensaje: mensajeDeFalla() }
    const { data, error } = await supabase.from('descanso').insert(nueva).select(COLUMNAS).single()
    const fila = error ? null : limpiar([data])?.[0]
    if (!fila) return { mensaje: mensajeDeFalla() }
    actualizar((lista) => [fila, ...lista])
    return { id: fila.id }
  }

  /**
   * Cambia una noche. Las horas las vuelve a calcular la base, así que se espera su respuesta
   * (mientras tanto se ven las calculadas en el celular). Devuelve un mensaje si no se pudo, o null.
   */
  async function cambiar(original: Noche, cambios: Partial<NuevaNoche>): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { id } = original
    const provisoria = { ...original, ...cambios }
    provisoria.horas = horasEntre(provisoria.me_dormi, provisoria.me_desperte)
    actualizar((lista) => lista.map((n) => (n.id === id ? provisoria : n)))
    const { data, error } = await supabase.from('descanso').update(cambios).eq('id', id).select(COLUMNAS).single()
    const fila = error ? null : limpiar([data])?.[0]
    actualizar((lista) => lista.map((n) => (n.id === id ? fila ?? original : n)))
    return fila ? null : mensajeDeFalla()
  }

  /** Borra una noche. Devuelve un mensaje si no se pudo, o null si salió bien. */
  async function borrar(id: string): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { error } = await supabase.from('descanso').delete().eq('id', id)
    if (error) return mensajeDeFalla()
    actualizar((lista) => lista.filter((n) => n.id !== id))
    return null
  }

  return { estado, agregar, cambiar, borrar, recargar }
}

// ---------- horas y resumen ----------

const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5))

/** Las mismas cuentas de la base: cruza la medianoche, de 23:30 a 06:00 son 6.5 horas. */
export function horasEntre(dormi: string, desperte: string): number {
  return Math.round((((minutos(desperte) - minutos(dormi) + 1440) % 1440) / 60) * 100) / 100
}

/** 7.5 → "7 h 30 min", 7 → "7 h", 0.75 → "45 min". */
export function duracion(horas: number): string {
  const total = Math.round(horas * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

/** Una noche por fecha: si hay dos el mismo día, la más reciente. */
export function porFecha(lista: Noche[]): Map<string, Noche> {
  const mapa = new Map<string, Noche>()
  for (const n of lista) {
    const antes = mapa.get(n.fecha)
    if (!antes || n.creado > antes.creado) mapa.set(n.fecha, n)
  }
  return mapa
}

export interface ResumenSueno {
  /** La noche que terminó hoy, si ya se anotó. */
  anoche: Noche | null
  /** Promedio de las noches anotadas en los últimos 7 días (hoy incluido). Null si no hay ninguna. */
  promedio: number | null
  noches: number
  cortas: number
  /** Calidad promedio de las noches que la tienen, o null. */
  calidad: number | null
  /** Noches cortas seguidas hasta la más reciente (hoy o ayer); se corta al faltar una noche. */
  seguidasCortas: number
}

export function resumirSueno(lista: Noche[], hoy = hoyEnElCelular()): ResumenSueno {
  const mapa = porFecha(lista)
  const semana = Array.from({ length: 7 }, (_, i) => mapa.get(sumarDiasISO(hoy, -i))).filter((n): n is Noche => Boolean(n))
  const conCalidad = semana.filter((n) => n.calidad !== null)
  let seguidasCortas = 0
  for (let i = mapa.has(hoy) ? 0 : 1; ; i++) {
    const n = mapa.get(sumarDiasISO(hoy, -i))
    if (!n || n.horas >= META_HORAS) break
    seguidasCortas++
  }
  return {
    anoche: mapa.get(hoy) ?? null,
    promedio: semana.length ? semana.reduce((s, n) => s + n.horas, 0) / semana.length : null,
    noches: semana.length,
    cortas: semana.filter((n) => n.horas < META_HORAS).length,
    calidad: conCalidad.length ? Math.round((conCalidad.reduce((s, n) => s + (n.calidad ?? 0), 0) / conCalidad.length) * 10) / 10 : null,
    seguidasCortas,
  }
}

/** La hora del celular redondeada hacia abajo a 5 minutos: "05:50". */
export function horaRedondeada(ahora = new Date()): string {
  const m = Math.floor(ahora.getMinutes() / 5) * 5
  return `${String(ahora.getHours()).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
