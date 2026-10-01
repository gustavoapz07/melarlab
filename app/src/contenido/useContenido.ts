// Contenido del usuario: de una idea a publicaciones, desde la tabla contenido de Supabase (docs/base-de-datos.md).
// Cada idea va de idea a producción y a publicada, con su formato, sus redes, la fecha en que sale y el enlace.
// Publicar se hace afuera, en el programador de cada red y siempre con revisión: la app lleva el seguimiento.
// La copia en el celular y cuándo se consulta están en useTabla.ts.
import { supabase } from '../cuenta/supabase.ts'
import { PREFIJOS } from '../guardado.ts'
import { hoyEnElCelular } from '../mi-dia/formato.ts'
import { esDe, mensajeDeFalla, useTabla, type EstadoTabla } from '../useTabla.ts'

export const FORMATOS = { reel: 'Reel', carrusel: 'Carrusel', post: 'Post', video_largo: 'Video largo', historia: 'Historia' } as const
export const REDES = { tiktok: 'TikTok', instagram: 'Instagram', linkedin: 'LinkedIn', facebook: 'Facebook', youtube: 'YouTube' } as const
export const ETAPAS = { idea: 'Idea', en_produccion: 'En producción', publicado: 'Publicado' } as const
export type Formato = keyof typeof FORMATOS
export type Red = keyof typeof REDES
export type EtapaContenido = keyof typeof ETAPAS
export const LARGO = { idea: 500, enlace: 2000 } as const

export interface Pieza {
  id: string
  idea: string
  formato: Formato | null
  redes: Red[]
  estado: EtapaContenido
  fecha_publicacion: string | null
  enlace: string | null
  creado: string
  actualizado: string
}

export type NuevaPieza = Pick<Pieza, 'idea' | 'formato' | 'redes' | 'estado' | 'fecha_publicacion'>
export type CambiosPieza = Partial<Omit<Pieza, 'id' | 'creado' | 'actualizado'>>
export type EstadoContenido = EstadoTabla<Pieza>

const COLUMNAS = 'id, idea, formato, redes, estado, fecha_publicacion, enlace, creado, actualizado'

function limpiar(v: unknown): Pieza[] | null {
  if (!Array.isArray(v)) return null
  return v.filter((f): f is Pieza => typeof f === 'object' && f !== null
    && typeof f.id === 'string' && typeof f.idea === 'string' && (f.formato === null || esDe(FORMATOS, f.formato))
    && Array.isArray(f.redes) && f.redes.every((r: unknown) => esDe(REDES, r)) && esDe(ETAPAS, f.estado)
    && (f.fecha_publicacion === null || (typeof f.fecha_publicacion === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha_publicacion)))
    && (f.enlace === null || (typeof f.enlace === 'string' && f.enlace.startsWith('https://')))
    && typeof f.creado === 'string' && typeof f.actualizado === 'string')
}

function consultar(senal: AbortSignal) {
  return supabase.from('contenido').select(COLUMNAS).order('creado', { ascending: true }).abortSignal(senal)
}

export function useContenido(usuario: string) {
  const { estado, actualizar, recargar } = useTabla(PREFIJOS.contenido + usuario, consultar, limpiar)

  async function agregar(nueva: NuevaPieza): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { data, error } = await supabase.from('contenido').insert(nueva).select(COLUMNAS).single()
    const fila = error ? null : limpiar([data])?.[0]
    if (!fila) return mensajeDeFalla()
    actualizar((lista) => [...lista, fila])
    return null
  }

  /** Cambia una pieza: se ve al instante y, si Supabase no lo acepta, vuelve a como estaba. */
  async function cambiar(original: Pieza, cambios: CambiosPieza): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { id } = original
    actualizar((lista) => lista.map((p) => (p.id === id ? { ...p, ...cambios } : p)))
    const { data, error } = await supabase.from('contenido').update(cambios).eq('id', id).select(COLUMNAS).single()
    const fila = error ? null : limpiar([data])?.[0]
    actualizar((lista) => lista.map((p) => (p.id === id ? fila ?? original : p)))
    return fila ? null : mensajeDeFalla()
  }

  async function borrar(id: string): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { error } = await supabase.from('contenido').delete().eq('id', id)
    if (error) return mensajeDeFalla()
    actualizar((lista) => lista.filter((p) => p.id !== id))
    return null
  }

  return { estado, agregar, cambiar, borrar, recargar }
}

// ---------- el tablero ----------

/** Toca publicarla: tiene fecha de hoy o de antes y todavía no se publicó. */
export const tocaPublicar = (p: Pieza, hoy = hoyEnElCelular()) => p.estado !== 'publicado' && p.fecha_publicacion !== null && p.fecha_publicacion <= hoy

const porFecha = (a: Pieza, b: Pieza) => {
  const fa = a.fecha_publicacion ?? '9999-12-31'
  const fb = b.fecha_publicacion ?? '9999-12-31'
  return fa !== fb ? (fa < fb ? -1 : 1) : a.creado < b.creado ? -1 : 1
}

export function agrupar(lista: Pieza[], hoy = hoyEnElCelular()) {
  const resto = lista.filter((p) => !tocaPublicar(p, hoy))
  return {
    tocaHoy: lista.filter((p) => tocaPublicar(p, hoy)).sort(porFecha),
    enProduccion: resto.filter((p) => p.estado === 'en_produccion').sort(porFecha),
    ideas: resto.filter((p) => p.estado === 'idea').sort((a, b) => (a.creado < b.creado ? 1 : -1)),
    publicadas: resto.filter((p) => p.estado === 'publicado').sort((a, b) => ((a.fecha_publicacion ?? a.actualizado) < (b.fecha_publicacion ?? b.actualizado) ? 1 : -1)),
  }
}

/** "Reel · Instagram y TikTok" */
export function formatoYRedes(p: Pick<Pieza, 'formato' | 'redes'>): string {
  const redes = p.redes.map((r) => REDES[r])
  const enRedes = redes.length > 1 ? `${redes.slice(0, -1).join(', ')} y ${redes.at(-1)}` : redes[0]
  return [p.formato ? FORMATOS[p.formato] : null, enRedes].filter(Boolean).join(' · ')
}

/** Para Mi Día: "Hoy toca publicar: Cómo armé MelarLab." o "Hoy toca publicar: A y B." Null si nada. */
export function lineaDeContenido(lista: Pieza[], hoy = hoyEnElCelular()): string | null {
  const ideas = lista.filter((p) => tocaPublicar(p, hoy)).sort(porFecha).map((p) => p.idea)
  if (!ideas.length) return null
  return `Hoy toca publicar: ${ideas.length > 1 ? `${ideas.slice(0, -1).join(', ')} y ${ideas.at(-1)}` : ideas[0]}.`
}

/**
 * La idea de contenido de Mi Día, lista para guardarla como pieza: el formato y las redes se reconocen en
 * el texto ("Carrusel", "LinkedIn e Instagram"); lo que no se reconoce queda vacío.
 */
export function deLaIdeaDeMiDia(idea: { titulo: string; formato?: string; red?: string; gancho?: string }): NuevaPieza {
  const formatoTxt = (idea.formato ?? '').toLowerCase()
  const formato = (Object.keys(FORMATOS) as Formato[]).find((f) => formatoTxt.includes(f === 'video_largo' ? 'video' : f)) ?? null
  const redTxt = (idea.red ?? '').toLowerCase()
  const redes = (Object.keys(REDES) as Red[]).filter((r) => redTxt.includes(r))
  const texto = idea.gancho ? `${idea.titulo}. Gancho: ${idea.gancho}` : idea.titulo
  return { idea: texto.slice(0, LARGO.idea), formato, redes, estado: 'idea', fecha_publicacion: null }
}
