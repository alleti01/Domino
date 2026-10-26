import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled with the site so it looks the same offline.
import '@fontsource-variable/instrument-sans'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import './landing.css'
import './motion.css'
import './story.css'
import App from './App.tsx'

// The app decides where each page starts (top, or a ?section=), not the browser.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
