// Convierte el JSON guardado en la base (o en el celular) a DatosMiDia.
// La base ya valida la forma general (publicar_mi_dia); aquí se descarta cualquier elemento que no tenga
// lo mínimo para dibujarse, para que un dato raro no rompa la pantalla. El texto se muestra siempre como
// texto (React no interpreta HTML) y los enlaces que no son https quedan como texto (ver MiDia.tsx).
import type { DatosMiDia, Elemento, Entrega, Evento, Idea, SeccionExtra, Ubicacion } from './tipos.ts'

type Objeto = Record<string, unknown>

const esObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined)
const numero = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const objetos = (v: unknown): Objeto[] => (Array.isArray(v) ? v.filter(esObjeto) : [])
const sinVacios = <T,>(lista: (T | null)[]): T[] => lista.filter((x): x is T => x !== null)

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** "7:00" o "07:00", con hora y minutos que existen. */
function hora(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? v : undefined
}

function elemento(o: Objeto): Elemento | null {
  const titulo = texto(o.titulo)
  if (!titulo) return null
  return {
    titulo,
    url: texto(o.url),
    texto: texto(o.texto),
    fuente: texto(o.fuente),
    cuando: texto(o.cuando),
    para_ti: texto(o.para_ti),
    letra_pequena: texto(o.letra_pequena),
  }
}

function evento(o: Objeto): Evento | null {
  const titulo = texto(o.titulo)
  if (!titulo) return null
  const inicio = hora(o.inicio)
  return {
    titulo,
    inicio,
    // Un fin sin inicio no se puede dibujar: se toma como evento de todo el día.
    fin: inicio ? hora(o.fin) : undefined,
    lugar: texto(o.lugar),
    url: texto(o.url),
    tentativo: o.tentativo === true || undefined,
  }
}

function entrega(o: Objeto): Entrega | null {
  const titulo = texto(o.titulo)
  if (!titulo || typeof o.fecha !== 'string' || !FECHA.test(o.fecha)) return null
  return { fecha: o.fecha, titulo, curso: texto(o.curso), url: texto(o.url) }
}

function ubicacion(v: unknown): Ubicacion | undefined {
  if (!esObjeto(v)) return undefined
  const nombre = texto(v.nombre)
  const lat = numero(v.lat)
  const lon = numero(v.lon)
  const tz = numero(v.tz)
  if (!nombre || lat === undefined || lon === undefined || tz === undefined) return undefined
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || Math.abs(tz) > 14) return undefined
  return { nombre, lat, lon, tz }
}

function idea(v: unknown): Idea | null {
  if (!esObjeto(v)) return null
  const titulo = texto(v.titulo)
  if (!titulo) return null
  return {
    titulo,
    formato: texto(v.formato),
    red: texto(v.red),
    gancho: texto(v.gancho),
    desarrollo: texto(v.desarrollo),
    cierre: texto(v.cierre),
  }
}

function seccionExtra(o: Objeto): SeccionExtra | null {
  const titulo = texto(o.titulo)
  if (!titulo) return null
  return { titulo, items: sinVacios(objetos(o.items).map(elemento)) }
}

/** Devuelve null si no hay ni siquiera una fecha válida: sin fecha no se puede dibujar el día. */
export function normalizar(v: unknown): DatosMiDia | null {
  if (!esObjeto(v) || typeof v.fecha !== 'string' || !FECHA.test(v.fecha)) return null
  const [y, m, d] = v.fecha.split('-').map(Number)
  const real = new Date(Date.UTC(y, m - 1, d))
  if (real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) return null

  return {
    fecha: v.fecha,
    generado: texto(v.generado),
    titular: texto(v.titular),
    ubicacion: ubicacion(v.ubicacion),
    eventos_hoy: sinVacios(objetos(v.eventos_hoy).map(evento)),
    eventos_manana: sinVacios(objetos(v.eventos_manana).map(evento)),
    atencion: sinVacios(objetos(v.atencion).map(elemento)),
    entregas: sinVacios(objetos(v.entregas).map(entrega)),
    resuelto: sinVacios(objetos(v.resuelto).map(elemento)),
    ia: sinVacios(objetos(v.ia).map(elemento)),
    idea: idea(v.idea),
    secciones_extra: sinVacios(objetos(v.secciones_extra).map(seccionExtra)),
    fuentes: Array.isArray(v.fuentes) ? v.fuentes.map(texto).filter((f): f is string => f !== undefined) : [],
  }
}
