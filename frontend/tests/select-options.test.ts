// DS-v2 Aşama 6b — Standart 12: açılır liste seçenek mantığı (EkSelect).
import { beforeEach, describe, expect, it } from 'vitest'
import { buildMenu, channelOptionsFrom, normalizeOptions, pushRecent, readRecent, splitMatch, toneOptionsFrom } from '../src/components/ds/selectOptions'

describe('selectOptions', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    ;(globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
  })

  it('normalizeOptions: item-title/item-value ve kanal türü', () => {
    const o = normalizeOptions([{ code: 'trendyol', title: 'Trendyol' }], 'title', 'code', 'channel')
    expect(o[0]).toMatchObject({ value: 'trendyol', title: 'Trendyol', channel: 'trendyol' })
    expect(normalizeOptions(['A', 'B'])[1]).toMatchObject({ value: 'B', title: 'B' })
  })

  it('channelOptionsFrom: tür alt satırı; toneOptionsFrom: ton', () => {
    expect(channelOptionsFrom([{ code: 'n11', title: 'N11', type: { code: 'marketplace' } }])[0]).toMatchObject({ channel: 'n11', subtitle: 'Pazaryeri' })
    expect(toneOptionsFrom([{ id: 'X', title: 'x' }], () => 'danger')[0]).toMatchObject({ value: 'X', tone: 'danger' })
  })

  it('buildMenu: son kullanılanlar üstte (tekrarsız), gruplar başlıklı; grup/son yoksa aynen', () => {
    const opts = [{ value: 1, title: 'a', group: 'G1' }, { value: 2, title: 'b', group: 'G2' }, { value: 3, title: 'c', group: 'G1' }]
    const rows = buildMenu(opts, [3])
    expect(rows.map((r) => (r.__header ? `#${r.title}` : r.value))).toEqual(['#Son kullanılanlar', 3, '#G1', 1, '#G2', 2])
    const flat = [{ value: 1, title: 'a' }]
    expect(buildMenu(flat)).toBe(flat)
  })

  it('splitMatch: Türkçe büyük/küçük harf duyarsız eşleşme parçaları', () => {
    expect(splitMatch('İade Yönetimi', 'yön')).toEqual([{ text: 'İade ', match: false }, { text: 'Yön', match: true }, { text: 'etimi', match: false }])
    expect(splitMatch('Trendyol', '')).toEqual([{ text: 'Trendyol', match: false }])
  })

  it('son kullanılanlar: en yeni başta, tekrarsız, en çok 5', () => {
    for (const v of [1, 2, 3, 4, 5, 6, 2]) pushRecent('k', [v])
    expect(readRecent('k')).toEqual([2, 6, 5, 4, 3])
    expect(readRecent(undefined)).toEqual([])
  })
})
