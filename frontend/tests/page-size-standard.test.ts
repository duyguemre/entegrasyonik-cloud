// DS-v2 Aşama 3 — sayfa boyutu standardı: tüm listeler 10/25/50/100 (EkPagerBar varsayılanı). Standart dışı
// seçenek (ör. 13, 15, 20) veya varsayılan limit seçicide anlamsız değer olarak görünüyordu.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const STANDARD = [10, 25, 50, 100]
const SRC = join(__dirname, '..', 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : /\.(vue|ts)$/.test(name) ? [p] : []
  })
}

const files = walk(SRC).map((path) => ({ path, text: readFileSync(path, 'utf8') }))

describe('sayfa boyutu standardı', () => {
  it('ekranlar standart dışı :page-size-options vermez', () => {
    const offenders = files.flatMap(({ path, text }) =>
      [...text.matchAll(/:page-size-options="\[([\d,\s]+)\]"/g)]
        .filter((m) => m[1].split(',').map(Number).some((n) => !STANDARD.includes(n)))
        .map((m) => `${path}: ${m[0]}`),
    )
    expect(offenders).toEqual([])
  })

  it('EkPagerBar varsayılanı standarttır', () => {
    const pager = files.find((f) => f.path.endsWith('EkPagerBar.vue'))!.text
    expect(pager).toContain('pageSizeOptions: () => [10, 25, 50, 100]')
  })

  it('EkPagerBar kullanan liste ekranlarının varsayılan limiti standart bir değerdir', () => {
    const offenders = files
      .filter(({ path, text }) => /EkListScreen|EkPagerBar|EkListFrame/.test(text) || /use\w+Filters\.ts$/.test(path))
      .flatMap(({ path, text }) =>
        [...text.matchAll(/\blimit: (\d+),/g)].filter((m) => !STANDARD.includes(Number(m[1])) && Number(m[1]) < 100).map((m) => `${path}: ${m[0]}`),
      )
    expect(offenders).toEqual([])
  })
})
