// ADR-0034 Karar 3 / §4.2: backend kopyası (`backend/src/operations/agent/protocol/v1.ts`) varsa ilk yorum bloğu hariç
// birebir eşit olmalı; yoksa atlanır (açık mesajla). Bulut backend'e yazamadığı için tek taraflı değişiklik kırmızı olur.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const FRONT = resolve(__dirname, '../src/protocol/v1.ts')
const BACK = resolve(__dirname, '../../../../backend/src/operations/agent/protocol/v1.ts')
const stripHeader = (src: string) => src.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/, '').replace(/\r\n/g, '\n')

describe('protokol eşitliği (frontend kanonik ↔ backend kopyası)', () => {
  const hasBackend = existsSync(BACK)
  it.skipIf(!hasBackend)('backend kopyası ilk yorum bloğu hariç birebir eşit', () => {
    expect(stripHeader(readFileSync(BACK, 'utf8'))).toBe(stripHeader(readFileSync(FRONT, 'utf8')))
  })
  it.runIf(!hasBackend)('ATLANDI: backend kopyası henüz yok (BR-1 yerel görevi oluşturacak) — backend/src/operations/agent/protocol/v1.ts', () => {
    expect(hasBackend).toBe(false)
  })
})
