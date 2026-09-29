// Forma de los datos de Mi Día. Es el mismo JSON que usa modulos/mi-dia/render_brief.py.

export interface Ubicacion {
  nombre: string
  lat: number
  lon: number
  /** Diferencia con UTC en horas, por ejemplo -6. */
  tz: number
}

export interface Evento {
  titulo: string
  /** "HH:MM"; sin inicio es un evento de todo el día. */
  inicio?: string
  fin?: string
  lugar?: string
  url?: string
  tentativo?: boolean
}

export interface Elemento {
  titulo: string
  url?: string
  texto?: string
  fuente?: string
  cuando?: string
  para_ti?: string
  letra_pequena?: string
}

export interface Entrega {
  /** "AAAA-MM-DD" */
  fecha: string
  titulo: string
  curso?: string
  url?: string
}

export interface Idea {
  titulo: string
  formato?: string
  red?: string
  gancho?: string
  desarrollo?: string
  cierre?: string
}

export interface SeccionExtra {
  titulo: string
  items?: Elemento[]
}

export interface DatosMiDia {
  /** "AAAA-MM-DD" */
  fecha: string
  generado?: string
  titular?: string
  ubicacion?: Ubicacion
  eventos_hoy?: Evento[]
  eventos_manana?: Evento[]
  atencion?: Elemento[]
  entregas?: Entrega[]
  resuelto?: Elemento[]
  ia?: Elemento[]
  idea?: Idea | null
  secciones_extra?: SeccionExtra[]
  fuentes?: string[]
}
