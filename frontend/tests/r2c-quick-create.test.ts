// FR2-PFORM 23 — combobox'tan yeni marka/kategori: saf yardımcılar (src/components/common/quickCreate.ts).
import { describe, expect, it } from 'vitest'
import { capitalize, createErrorMessage, findDuplicate, normalizeTitle, titleProblem, trIncludes } from '@/components/common/quickCreate'

const httpError = (status: number, data: Record<string, unknown> = {}) => ({ isAxiosError: true, response: { status, data } })

describe('normalizeTitle / trIncludes', () => {
  it('boşlukları sadeleştirir', () => {
    expect(normalizeTitle('  Deri   Çanta ')).toBe('Deri Çanta')
    expect(normalizeTitle(undefined)).toBe('')
  })
  it('Türkçe harf duyarsız arar (İ/ı)', () => {
    expect(trIncludes('İPEK Şal', 'ipek')).toBe(true)
    expect(trIncludes('Işıklı Ayna', 'IŞIK')).toBe(true)
    expect(trIncludes('Kazak', 'kaban')).toBe(false)
    expect(trIncludes('Kazak', '  ')).toBe(true)
  })
})

describe('findDuplicate', () => {
  const list = [{ _id: 'a', title: 'İnci Takı' }, { _id: 'b', title: 'Deri Çanta' }]
  it('tr büyük/küçük harf ve boşluk farkını yok sayar', () => {
    expect(findDuplicate(list, 'inci  takı')?._id).toBe('a')
    expect(findDuplicate(list, 'DERİ ÇANTA')?._id).toBe('b')
  })
  it('eşleşme yoksa ya da ad boşsa undefined', () => {
    expect(findDuplicate(list, 'Deri')).toBeUndefined()
    expect(findDuplicate(list, '')).toBeUndefined()
    expect(findDuplicate(undefined, 'x')).toBeUndefined()
  })
})

describe('titleProblem', () => {
  it('2–160 kuralı, anlaşılır mesaj', () => {
    expect(titleProblem('', 'marka')).toBe('Marka adı gerekli.')
    expect(titleProblem(' a ', 'marka')).toMatch(/en az 2/)
    expect(titleProblem('x'.repeat(161), 'kategori')).toMatch(/en çok 160/)
    expect(titleProblem('Nike', 'marka')).toBeNull()
  })
})

describe('createErrorMessage — ham hata gösterilmez', () => {
  it('403 → yetki mesajı', () => {
    expect(createErrorMessage(httpError(403), 'marka')).toMatch(/yetkiniz yok/)
  })
  it('400 → sunucunun Türkçe mesajı', () => {
    expect(createErrorMessage(httpError(400, { error: 'Başlık en fazla 200 karakter olabilir.' }), 'marka')).toBe('Başlık en fazla 200 karakter olabilir.')
  })
  it('5xx / ağ → genel mesaj', () => {
    expect(createErrorMessage(httpError(500, { error: 'MongoServerError E11000' }), 'kategori')).toBe('Kategori eklenemedi — bağlantınızı kontrol edip tekrar deneyin.')
    expect(createErrorMessage(new Error('Network Error'), 'marka')).toMatch(/eklenemedi/)
  })
  it('capitalize Türkçe', () => {
    expect(capitalize('işlem')).toBe('İşlem')
  })
})
