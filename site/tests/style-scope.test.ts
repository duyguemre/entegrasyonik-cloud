/**
 * S27b (SR4-12 site geneli): `Section`'a geçirilen sınıfın kapsamlı seçicisi (`.x:global(.section)`) HİÇ eşleşmez —
 * <section> öğesini Section.astro kendi kapsam kimliğiyle basar (S22'de /otopilot için bulunan kök neden). İç sayfa
 * hero/bölüm boşlukları bu yüzden uygulanmıyordu. Kural: Section'a sınıf veren bileşen `:global(.section.x)` yazar.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = path.join(d, n)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.astro') ? [p] : []
  })
// Anasayfa bileşenleri S27a dalında (paralel iş) — birleştirmede bu istisna kaldırılır.
const PENDING = new Set(['components/home/AssistantTeaser.astro'])

describe('Section sınıf seçicileri eşleşir', () => {
  it('hiçbir bileşen `.x:global(.section)` (eşleşmeyen kapsamlı seçici) kullanmaz', () => {
    const hits = walk(src)
      .filter((f) => !PENDING.has(path.relative(src, f).split(path.sep).join('/')))
      .filter((f) => /^\s*\.[\w-]+:global\(\.section\)/m.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')))
      .map((f) => path.relative(src, f))
    expect(hits).toEqual([])
  })
})
