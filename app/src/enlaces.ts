// Enlaces que escribe el usuario (tiendas, publicaciones). La base solo acepta https, así que la app lo revisa
// antes de enviar; al mostrarlos, se abren aparte y sin pasarles nada de la app.

/** "https://tienda.com/x" si sirve para la base, null si va vacío; undefined si no sirve (no es https). */
export function leerEnlace(texto: string, largo = 2000): string | null | undefined {
  const t = texto.trim()
  if (!t) return null
  return /^https:\/\/\S+$/i.test(t) && t.length <= largo ? t : undefined
}

/** El dominio, para mostrar el enlace corto: "tienda.com". */
export function dominio(enlace: string): string {
  try {
    return new URL(enlace).hostname.replace(/^www\./, '')
  } catch {
    return enlace
  }
}
