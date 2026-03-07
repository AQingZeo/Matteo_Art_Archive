import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'

const LANDING_MINI_IMAGES_ID = 'virtual:landing-mini-images'

function landingMiniPlugin() {
  return {
    name: 'landing-mini-images',
    resolveId(id: string) {
      if (id === LANDING_MINI_IMAGES_ID) return '\0' + id
      return null
    },
    load(id: string) {
      if (id !== '\0' + LANDING_MINI_IMAGES_ID) return null
      const dir = path.join(process.cwd(), 'public', 'landingMini')
      const ext = /\.(png|jpg|jpeg|gif|webp|svg)$/i
      const files = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((f) => ext.test(f)).sort()
        : []
      return `export const LANDING_MINI_IMAGES = ${JSON.stringify(files)}`
    },
  }
}

export default defineConfig({
  plugins: [landingMiniPlugin(), react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
