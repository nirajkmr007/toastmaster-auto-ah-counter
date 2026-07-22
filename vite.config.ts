import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GH Pages serves this repo at nirajkmr007.github.io/toastmaster-auto-ah-counter/
// so the production bundle has to know its subpath. Dev keeps the root so
// `npm run dev` stays at http://localhost:5173/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/toastmaster-auto-ah-counter/' : '/',
  plugins: [react()],
}))
