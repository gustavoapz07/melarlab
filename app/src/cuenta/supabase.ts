// Cliente de Supabase. Solo lleva la clave publicable, que está hecha para ir en el navegador:
// lo que cada usuario puede ver o cambiar lo deciden las reglas (RLS) de la base.
import { createClient } from '@supabase/supabase-js'
import type { Database } from './base-de-datos.ts'

const url = import.meta.env.VITE_SUPABASE_URL
const clave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/** Dónde guarda la sesión el celular (localStorage). */
export const CLAVE_SESION = 'melarlab.sesion'

export const configurada = Boolean(url && clave)

/**
 * Si un enlace de correo venció o ya se usó, Supabase vuelve a la app con el error en la dirección.
 * Se lee y se limpia antes de crear el cliente, para mostrar un mensaje claro en vez del error crudo.
 */
function leerErrorDelEnlace(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1))
  const codigo = params.get('error_code') || params.get('error')
  if (!codigo) return null
  window.history.replaceState(window.history.state, '', window.location.pathname)
  return codigo
}

export const errorDelEnlace = leerErrorDelEnlace()

export const supabase = createClient<Database>(url ?? 'https://sin-configurar.invalid', clave ?? 'sin-configurar', {
  auth: {
    // Flujo "implícito": el enlace del correo funciona aunque se abra en otro navegador
    // (en iPhone, la app instalada y Safari no comparten lo guardado).
    flowType: 'implicit',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: CLAVE_SESION,
  },
})
