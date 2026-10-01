// Radar semanal de IA, desde la tabla radar de Supabase: la rutina de los domingos lo publica con
// publicar_radar() (docs/base-de-datos.md) y la app solo lee. Se traen los últimos 8. Lo que llega se revisa
// antes de dibujarlo (normalizar): sin título no hay novedad, los enlaces solo https y el texto nunca se
// interpreta como HTML. La copia en el celular y cuándo se consulta están en useTabla.ts.
import { supabase } from '../cuenta/supabase.ts'
import { PREFIJOS } from '../guardado.ts'
import { useTabla } from '../useTabla.ts'

/** La forma del JSON que publica la rutina (la misma lista de claves que acepta publicar_radar). */
export interface Novedad {
  titulo: string
  /** Qué es y qué cambió. */
  texto?: string
  /** "Gratis", "Plan gratis con límites", "De pago"… */
  gratis?: string
  letra_pequena?: string
  /** Cómo aplicarla en mi caso. */
  aplicacion?: string
  enlace?: string
  fuente?: string
}

export interface DatosRadar {
  fecha: string
  generado?: string
  titular?: string
  resumen?: string
  novedades: Novedad[]
  probar?: { titulo: string; texto?: string; pasos?: string[]; enlace?: string }
  idea_servicio?: { titulo: string; texto?: string }
  fuentes?: string[]
}

export interface Radar {
  fecha: string
  datos: DatosRadar
}

const texto = (v: unknown, largo = 2000): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, largo) : undefined)
const enlace = (v: unknown): string | undefined => {
  const t = texto(v, 2000)
  return t && /^https:\/\/\S+$/i.test(t) ? t : undefined
}
const objeto = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null)

/** Revisa un Radar antes de dibujarlo. Null si no sirve (sin fecha o sin ninguna novedad con título). */
export function normalizar(v: unknown): DatosRadar | null {
  const d = objeto(v)
  if (!d || typeof d.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) return null
  const novedades = (Array.isArray(d.novedades) ? d.novedades : []).slice(0, 12).flatMap((x): Novedad[] => {
    const n = objeto(x)
    const titulo = texto(n?.titulo, 300)
    if (!n || !titulo) return []
    return [{
      titulo, texto: texto(n.texto), gratis: texto(n.gratis, 200), letra_pequena: texto(n.letra_pequena), aplicacion: texto(n.aplicacion),
      enlace: enlace(n.enlace), fuente: texto(n.fuente, 200),
    }]
  })
  if (!novedades.length) return null
  const probar = objeto(d.probar)
  const idea = objeto(d.idea_servicio)
  const tituloProbar = texto(probar?.titulo, 300)
  const tituloIdea = texto(idea?.titulo, 300)
  return {
    fecha: d.fecha,
    generado: texto(d.generado, 100),
    titular: texto(d.titular, 300),
    resumen: texto(d.resumen),
    novedades,
    probar: probar && tituloProbar ? {
      titulo: tituloProbar, texto: texto(probar.texto), enlace: enlace(probar.enlace),
      pasos: (Array.isArray(probar.pasos) ? probar.pasos : []).map((p) => texto(p, 500)).filter((p): p is string => Boolean(p)).slice(0, 10),
    } : undefined,
    idea_servicio: idea && tituloIdea ? { titulo: tituloIdea, texto: texto(idea.texto) } : undefined,
    fuentes: (Array.isArray(d.fuentes) ? d.fuentes : []).map((f) => texto(f, 200)).filter((f): f is string => Boolean(f)).slice(0, 30),
  }
}

/** Las filas de la tabla (o de la copia guardada): solo las que se pueden dibujar. */
function limpiar(v: unknown): Radar[] | null {
  if (!Array.isArray(v)) return null
  return v.flatMap((f): Radar[] => {
    const datos = normalizar(objeto(f)?.datos)
    return datos ? [{ fecha: datos.fecha, datos }] : []
  })
}

function consultar(senal: AbortSignal) {
  return supabase.from('radar').select('fecha, datos').order('fecha', { ascending: false }).limit(8).abortSignal(senal)
}

/** Los últimos radares, del más nuevo al más viejo. Solo lectura: los escribe la rutina. */
export function useRadar(usuario: string) {
  const { estado, recargar } = useTabla(PREFIJOS.radar + usuario, consultar, limpiar)
  return { estado, recargar }
}
