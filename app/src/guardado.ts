// Copias en el celular de lo que la app trae de Supabase, para verlo sin internet.
// Cada módulo usa su propio prefijo y una clave por usuario. Cerrar sesión las borra todas.

/** Prefijos de todo lo que se guarda con datos del usuario. */
export const PREFIJOS = {
  miDia: 'melarlab.mi-dia.',
  pendientes: 'melarlab.pendientes.',
  estudios: 'melarlab.estudios.',
  billetera: 'melarlab.billetera.',
} as const

export function leerGuardado(clave: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(clave) ?? 'null')
  } catch {
    return null
  }
}

export function guardar(clave: string, valor: unknown) {
  try {
    if (valor === null || valor === undefined) localStorage.removeItem(clave)
    else localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    // Sin almacenamiento: se ve igual, solo que no queda para abrirlo sin internet.
  }
}

/** Borra del celular todo lo guardado de cualquier usuario. Se llama al cerrar sesión. */
export function borrarDatosGuardados() {
  try {
    const prefijos = Object.values(PREFIJOS)
    for (const clave of Object.keys(localStorage)) {
      if (prefijos.some((p) => clave.startsWith(p))) localStorage.removeItem(clave)
    }
  } catch {
    // Sin almacenamiento: no hay nada guardado que borrar.
  }
}
