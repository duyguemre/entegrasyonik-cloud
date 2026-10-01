// Bulut oturumu: üretim derlemesi duman/PWA testleri önceden kurulu Chromium ile (indirme yok). Ayrıntı: docs/CLOUD_BRIEFS.md.
import base from './playwright.preview.config'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  ...base,
  use: { ...base.use, launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' } },
})
