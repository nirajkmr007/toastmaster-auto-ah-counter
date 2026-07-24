import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GH Pages serves this repo at nirajkmr007.github.io/toastmaster-auto-ah-counter/
// so the production bundle has to know its subpath. Dev keeps the root so
// `npm run dev` stays at http://localhost:5173/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/toastmaster-auto-ah-counter/' : '/',
  plugins: [react()],
  worker: {
    // The CrisperWhisper engine runs in a module worker; keep the format
    // explicit so bare imports (transformers.js) resolve the same way in
    // dev and build.
    format: 'es',
  },
  optimizeDeps: {
    // transformers.js bundles onnxruntime-web (wasm). esbuild's dep
    // pre-bundling mangles that, so let Vite serve it as native ESM instead.
    exclude: ['@huggingface/transformers'],
  },
}))
