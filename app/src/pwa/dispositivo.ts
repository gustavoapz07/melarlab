// Qué celular es y si la app ya está instalada. Lo usan el aviso de instalar y el de las 6:00.

/** La app abierta desde la pantalla de inicio (instalada), no desde el navegador. */
export const yaInstalada = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** iPhone o iPad (el iPad nuevo se presenta como Mac con pantalla táctil). */
export const esIPhone = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
