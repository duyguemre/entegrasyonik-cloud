// R7 / G-01 — ConfirmationDialogComponent'in güvenli mesaj modeli (birim testi).
import { describe, it, expect } from 'vitest'
import { text, emphasis, note, lineBreak, messagePartsToPlainText } from '../../src/components/layout/messageParts'
import { escapeHtml } from '../../src/utils/escapeHtml'

describe('messageParts', () => {
  it('parça kurucuları değeri metne çevirir ve HTML yorumlamaz', () => {
    expect(emphasis('<img src=x onerror=alert(1)>')).toEqual({ type: 'emphasis', text: '<img src=x onerror=alert(1)>' })
    expect(text(42)).toEqual({ type: 'text', text: '42' })
    expect(note(null)).toEqual({ type: 'note', text: '' })
    expect(text(undefined)).toEqual({ type: 'text', text: '' })
    expect(lineBreak()).toEqual({ type: 'break' })
  })

  it('düz metin karşılığı: satır sonu \\n, işaretleme yok', () => {
    const parts = [
      emphasis('Ayşe Yılmaz'),
      text(' isimli müşteriyi silmek istediğinize emin misiniz? '),
      lineBreak(),
      lineBreak(),
      text(' '),
      note('Not'),
    ]
    expect(messagePartsToPlainText(parts)).toBe('Ayşe Yılmaz isimli müşteriyi silmek istediğinize emin misiniz? \n\n Not')
  })
})

describe('escapeHtml', () => {
  it('tehlikeli karakterleri kaçırır', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe('&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;')
  })
  it('null/undefined boş dize, sayılar metne çevrilir', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(0)).toBe('0')
    expect(escapeHtml(12.5)).toBe('12.5')
  })
})
