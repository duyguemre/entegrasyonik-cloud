// @entegrasyonik/chat birim testleri (CHAT_UI_CONTRACT.md §9). Bileşen testleri happy-dom + @vue/test-utils ile.
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    css: false,
    server: { deps: { inline: [/vuetify/, /@mdi\/font/] } },
  },
})
