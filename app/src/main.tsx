import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Solo el subconjunto latino (cubre ñ y tildes), para que la app pese poco sin internet.
import '@fontsource/archivo/latin-400.css'
import '@fontsource/archivo/latin-600.css'
import '@fontsource/archivo/latin-700.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import './estilos.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
