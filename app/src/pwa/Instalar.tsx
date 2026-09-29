// Invitación a instalar la app. Android (Chrome) ofrece su propio aviso; el iPhone no tiene aviso
// automático, así que ahí se explica cómo hacerlo desde Safari.
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const CLAVE = 'melarlab.instalar.oculto'

function leerOculto(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1'
  } catch {
    return false
  }
}

function guardarOculto() {
  try {
    localStorage.setItem(CLAVE, '1')
  } catch {
    // Sin almacenamiento (modo privado): el aviso vuelve a salir la próxima vez.
  }
}

const yaInstalada = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

const esIPhone = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

export function Instalar() {
  const [pedido, setPedido] = useState<BeforeInstallPromptEvent | null>(null)
  const [oculto, setOculto] = useState(() => leerOculto() || yaInstalada())

  useEffect(() => {
    const alPoder = (e: Event) => {
      e.preventDefault()
      setPedido(e as BeforeInstallPromptEvent)
    }
    const alInstalar = () => {
      setPedido(null)
      setOculto(true)
    }
    window.addEventListener('beforeinstallprompt', alPoder)
    window.addEventListener('appinstalled', alInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', alPoder)
      window.removeEventListener('appinstalled', alInstalar)
    }
  }, [])

  const cerrar = () => {
    guardarOculto()
    setOculto(true)
  }

  if (oculto) return null

  if (pedido) {
    const instalar = async () => {
      await pedido.prompt()
      await pedido.userChoice
      setPedido(null)
    }
    return (
      <div className="aviso">
        <span>Instala MelarLab como app</span>
        <span className="acc">
          <button type="button" className="btn" onClick={instalar}>Instalar</button>
          <button type="button" className="btn btn-q" onClick={cerrar}>Ahora no</button>
        </span>
      </div>
    )
  }

  if (esIPhone()) {
    return (
      <div className="aviso">
        <span>Para instalarla en Safari: Compartir → Agregar a pantalla de inicio</span>
        <span className="acc">
          <button type="button" className="btn btn-q" onClick={cerrar}>Entendido</button>
        </span>
      </div>
    )
  }

  return null
}
