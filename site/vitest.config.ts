import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // dist.test.ts iki gerçek `astro build` çalıştırır.
    // pages/legal/home testleri her biri gerçek `astro build` çalıştırır; dosyalar paralel koşunca eşzamanlı
    // build'ler birbirini çökertiyordu (worker "Channel closed", takılma) — dosyalar sırayla koşar.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
})
