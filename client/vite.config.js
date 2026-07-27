import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

function pwaIconPlugin() {
  return {
    name: 'pwa-icon-plugin',
    buildStart() {
      try {
        const mobileIcon = path.resolve(__dirname, '../mobile/assets/icon.png')
        const publicDir = path.resolve(__dirname, 'public')
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true })
        }
        if (fs.existsSync(mobileIcon)) {
          fs.copyFileSync(mobileIcon, path.join(publicDir, 'icon-512.png'))
          fs.copyFileSync(mobileIcon, path.join(publicDir, 'icon-192.png'))
          console.log('[PWA Icon Plugin] Successfully copied mobile icon to public/icon-192.png and public/icon-512.png')
        }
      } catch (err) {
        console.error('[PWA Icon Plugin] Failed to copy icon:', err)
      }
    }
  }
}

export default defineConfig({
  plugins: [react(), pwaIconPlugin()],
  server: {
    host: true,
    port: 5173
  }
})

