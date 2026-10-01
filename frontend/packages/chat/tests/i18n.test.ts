import { describe, expect, it } from 'vitest'
import { en } from '../src/i18n/en'
import { tr } from '../src/i18n/tr'
import { createTranslator, interpolate } from '../src/i18n'
import { CHAT_ERROR_CODES } from '../src/protocol/v1'

describe('i18n', () => {
  it('tr ve en anahtar kümeleri birebir; boş metin yok', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort())
    for (const [k, v] of Object.entries({ ...tr, ...en })) expect(v.trim().length, k).toBeGreaterThan(0)
  })
  it('her sohbet hata kodu için yedek metin var (tr/en)', () => {
    for (const code of CHAT_ERROR_CODES) {
      expect(tr[`turnError.${code}` as keyof typeof tr], code).toBeTruthy()
      expect(en[`turnError.${code}` as keyof typeof en], code).toBeTruthy()
    }
  })
  it('{name} ürün adıyla dolar; host t önceliklidir', () => {
    const t = createTranslator(() => 'tr', (key) => (key === 'chat.composer.send' ? 'Yolla' : undefined))
    expect(t('composer.label')).toBe("Otopilot'a mesaj")
    expect(t('composer.send')).toBe('Yolla')
    expect(createTranslator(() => 'en')('composer.label')).toBe('Message Otopilot')
    expect(interpolate('{a}-{b}', { a: 1 })).toBe('1-{b}')
  })
})
