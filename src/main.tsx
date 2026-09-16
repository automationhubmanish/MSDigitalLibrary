import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Supabase confirmation links can return Auth tokens in the fragment. Login uses
// our HttpOnly server session, so these tokens must not remain in the address bar.
const authFragment = new URLSearchParams(window.location.hash.slice(1))
if (authFragment.has('access_token') || authFragment.has('error_description')) {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
