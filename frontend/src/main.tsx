import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import App from './App.tsx'

// The build injects a static copy of the app into #ssr-fallback so crawlers
// and no-JS visitors see real content. Hydration is skipped on purpose (the
// date preset makes SSR markup differ from the first client render), so the
// fallback is removed once React is ready to take over.
document.getElementById('ssr-fallback')?.remove();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
)
