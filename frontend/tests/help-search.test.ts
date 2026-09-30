// faz3-fe-help — yardım araması: Türkçe katlama, VE eşleşmesi, puan sırası, vurgu parçaları, alıntı.
import { describe, it, expect } from 'vitest'
import { foldText, highlight, queryTerms, searchHelp, plain, type HelpSearchDoc } from '../src/help/search'
import { searchHelpArticles } from '../src/help'
import type { HelpArticle } from '../src/help/types'

const art = (id: string, title: string, summary: string, text: string, keywords: string[] = []): HelpSearchDoc => ({
  article: { id, category: 'faq', title, summary, keywords, body: [{ type: 'p', text }] } as HelpArticle,
  lines: [text],
})

describe('katlama ve terimler', () => {
  it('uzunluk korunur; büyük/küçük ve diakritik farkı yok sayılır', () => {
    for (const s of ['İADE ŞİŞLİ', 'Sipariş Gelmedi', 'ığüşöç IĞÜŞÖÇ']) expect(foldText(s)).toHaveLength(s.length)
    expect(foldText('İADE Şişli')).toBe('iade sisli')
    expect(foldText('IĞDIR')).toBe('igdir')
  })

  it('tek harfli terimler (başka terim varsa) atılır, tekrarlar birleşir', () => {
    expect(queryTerms('  a stok  STOK ')).toEqual(['stok'])
    expect(queryTerms('x')).toEqual(['x'])
  })
})

describe('vurgu', () => {
  it('eşleşme konumları özgün metinde (diakritik farkına rağmen) doğru; çakışanlar birleşir', () => {
    expect(highlight('Sipariş iptali', ['siparis'])).toEqual([
      { text: 'Sipariş', match: true },
      { text: ' iptali', match: false },
    ])
    const parts = highlight('stok stoku', ['sto', 'stok'])
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['stok', 'stok'])
    expect(highlight('abc', [])).toEqual([{ text: 'abc', match: false }])
  })

  it('**kalın** işareti aramada düz metne iner', () => {
    expect(plain('**Kaydet**’e basın')).toBe('Kaydet’e basın')
  })
})

describe('searchHelp', () => {
  const docs = [
    art('a', 'Güvenlik stoğu', 'Tampon ayarı', 'Kanal başına tampon.'),
    art('b', 'Stok sağlığı', 'Aşırı satış', 'Güvenlik stoğu burada görünmez.'),
    art('c', 'Sipariş gelmedi', 'Kontrol listesi', 'Entegrasyon durumunu kontrol edin.', ['siparis yok']),
  ]

  it('tüm terimler gerekli (VE); başlık eşleşmesi gövdeden önce gelir', () => {
    const r = searchHelp(docs, 'guvenlik stogu')
    expect(r.map((x) => x.article.id)).toEqual(['a', 'b'])
    expect(searchHelp(docs, 'güvenlik sipariş')).toEqual([])
  })

  it('anahtar sözcük eşleşir; boş sorgu sonuç vermez; alıntı vurgulu', () => {
    expect(searchHelp(docs, 'siparis yok')[0].article.id).toBe('c')
    expect(searchHelp(docs, '   ')).toEqual([])
    const [hit] = searchHelp(docs, 'kanal')
    expect(hit.excerpt.some((p) => p.match && foldText(p.text) === 'kanal')).toBe(true)
  })

  it('gerçek içerikte: sık kullanıcı sorguları doğru makaleyi ilk sıraya getirir', () => {
    expect(searchHelpArticles('siparis gelmedi')[0].article.id).toBe('ts-order-missing')
    expect(searchHelpArticles('pazaryerine gitmedi')[0].article.id).toBe('ts-product-not-sent')
    expect(searchHelpArticles('kısayol')[0].article.id).toBe('app-shortcuts')
    expect(searchHelpArticles('Trendyol API').length).toBeGreaterThan(0)
    // Otomatik blok metni (kısayol tablosu) aranabilir.
    expect(searchHelpArticles('sonraki sekme').some((r) => r.article.id === 'app-shortcuts')).toBe(true)
  })
})
