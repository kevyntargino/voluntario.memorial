import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registrarServiceWorker } from './lib/pwa.js'

registrarServiceWorker().catch(() => {
  // O PWA não deve bloquear o carregamento do app.
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
