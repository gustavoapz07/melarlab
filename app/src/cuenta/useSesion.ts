import type { User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { borrarMiDiaGuardado } from '../mi-dia/useMiDia.ts'
import { CLAVE_SESION, supabase } from './supabase.ts'

export type Sesion =
  | { tipo: 'cargando' }
  | { tipo: 'fuera' }
  /** Llegó desde el enlace de "recuperar contraseña": falta elegir la nueva. */
  | { tipo: 'nueva-contrasena'; usuario: User }
  | { tipo: 'dentro'; usuario: Pick<User, 'id' | 'email'>; aviso?: string }

/**
 * Usuario de la sesión guardada en el celular, aunque su permiso de acceso haya vencido.
 * Sin internet, Supabase reintenta renovar el permiso durante unos 30 segundos y después responde
 * "sin sesión", pero la conserva guardada para renovarla al volver la red. Por eso la app no espera
 * esa respuesta: si hay una sesión guardada, Mi Día se muestra de inmediato.
 */
function usuarioGuardado(): Pick<User, 'id' | 'email'> | null {
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE_SESION) ?? 'null') as { user?: User } | null
    return guardada?.user?.id ? { id: guardada.user.id, email: guardada.user.email } : null
  } catch {
    return null
  }
}

export function useSesion(): { sesion: Sesion; salir: () => Promise<void> } {
  const [sesion, setSesion] = useState<Sesion>(() => {
    const u = usuarioGuardado()
    return u ? { tipo: 'dentro', usuario: u } : { tipo: 'cargando' }
  })

  useEffect(() => {
    // Aquí solo se cambia el estado: Supabase pide no llamar a sus funciones dentro de este aviso.
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY' && s) {
        setSesion({ tipo: 'nueva-contrasena', usuario: s.user })
      } else if (evento === 'SIGNED_OUT') {
        borrarMiDiaGuardado()
        setSesion({ tipo: 'fuera' })
      } else if (s) {
        setSesion((antes) => {
          if (antes.tipo === 'nueva-contrasena') {
            // Se queda en el formulario hasta que la contraseña nueva se guarde.
            return evento === 'USER_UPDATED' ? { tipo: 'dentro', usuario: s.user, aviso: 'Contraseña actualizada.' } : antes
          }
          return { tipo: 'dentro', usuario: s.user }
        })
      } else {
        const u = usuarioGuardado()
        setSesion(u ? { tipo: 'dentro', usuario: u } : { tipo: 'fuera' })
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  /**
   * Cierra la sesión en Supabase y en el celular. Sin internet, Supabase no puede cerrarla de su lado
   * (y puede tardar en rendirse), así que se le dan 3 segundos y después se borra del celular igual.
   */
  async function salir() {
    const espera = new Promise((listo) => setTimeout(listo, 3000))
    await Promise.race([supabase.auth.signOut().catch(() => undefined), espera])
    try {
      localStorage.removeItem(CLAVE_SESION)
    } catch {
      // Sin almacenamiento: no hay nada guardado que borrar.
    }
    // Lo que se guardó para ver sin internet tampoco se queda en el celular.
    borrarMiDiaGuardado()
    setSesion({ tipo: 'fuera' })
  }

  return { sesion, salir }
}
