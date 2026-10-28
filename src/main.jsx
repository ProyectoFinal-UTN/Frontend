import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registrarServiceWorker } from './services/pushNavegador'

// El service worker que muestra los avisos de reposición (HU-18). Registrarlo
// no le pide permiso a nadie; eso pasa recién al activar el interruptor.
registrarServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
