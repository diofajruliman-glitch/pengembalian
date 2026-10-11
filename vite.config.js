import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import adjustmentsDev from './scripts/adjustments_dev.mjs'
export default defineConfig({ plugins: [react(), adjustmentsDev()], build: { target: 'es2022' } })
