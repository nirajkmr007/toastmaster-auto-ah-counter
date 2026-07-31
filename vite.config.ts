import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GH Pages serves this repo at nirajkmr007.github.io/toastmaster-auto-ah-counter/
// so the production bundle needs its subpath. Dev keeps the root so
// `npm run dev` stays at http://localhost:5173/. If you fork/rename the repo,
// update the base string to match your repo name.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/toastmaster-auto-ah-counter/' : '/',
  plugins: [react()],
}))
