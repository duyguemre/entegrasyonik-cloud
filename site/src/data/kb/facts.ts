/**
 * Rehberde RAKAM içerebilen tek yer: doğrulanmış olgu belirteçleri (KB §2 "Doğrulanmış olgular").
 *
 * Kural (tests/rehber.test.ts zorlar): rehber metinlerinde geçen her rakam, aşağıdaki belirteçlerden birinin
 * parçasıdır; başka rakam yazılamaz. Her belirteç ya en az bir RESMİ kaynağa (`basis: 'R'`) ya da birbirinden
 * bağımsız, tutarlı en az İKİ ikincil kaynağa (`basis: '2İ'`) dayanır. KB'de DOĞRULANAMADI işaretli alanlar
 * (komisyon oranları, e-Arşiv sınır tutarı, pazaryeri payı, hakediş takvimleri, pazaryeri onay süreleri, saklama
 * süresi) burada YOKTUR ve bu yüzden sayfalara yazılamaz.
 *
 * `kbRefs`: KB kaynak kimlikleri. `2İ` belirteçlerinin kaynakları rakip adı taşıdığı için sitede kaynak olarak
 * GÖSTERİLMEZ (KB §14); sayfa bunun yerine bağlayıcı resmi metne yönlendirir ve bunu açıkça yazar.
 */
export type FactBasis = 'R' | '2İ' | 'id'

export interface FactToken {
  token: string
  basis: FactBasis
  kbRefs: string[]
  fact: string
}

const f = (token: string, basis: FactBasis, kbRefs: string[], fact: string): FactToken => ({ token, basis, kbRefs, fact })

export const factTokens: FactToken[] = [
  // --- F1–F7: Ticaret Bakanlığı "Türkiye'de E-Ticaretin Görünümü" 2025 (S1, resmi)
  f('4,57 trilyon TL', 'R', ['S1'], 'F1 e-ticaret hacmi 2025'),
  f('%52,2', 'R', ['S1'], 'F1 TL bazında yıllık artış'),
  f('115,43 milyar ABD doları', 'R', ['S1'], 'F1 dolar bazında hacim'),
  f('%28,9', 'R', ['S1'], 'F1 dolar bazında artış'),
  f('5,94 milyar', 'R', ['S1'], 'F2 işlem sayısı'),
  f('634.611', 'R', ['S1'], 'F3 aktif e-ticaret işletmesi'),
  f('%75', 'R', ['S1'], 'F3 şahıs işletmesi payı'),
  f('%21', 'R', ['S1'], 'F3 limited şirket payı'),
  f('%4', 'R', ['S1'], 'F3 anonim şirket payı'),
  f('2,46 trilyon TL', 'R', ['S1'], 'F4 perakende e-ticaret hacmi'),
  f('%51,8', 'R', ['S1'], 'F4 perakende artış'),
  f('%6,9', 'R', ['S1'], 'F5 GSYH içindeki pay'),
  f('%19,3', 'R', ['S1'], 'F5 toplam ticaretteki pay'),
  f('%62,5', 'R', ['S1'], 'F6 kartlı ödeme payı'),
  f('%64,1', 'R', ['S1'], 'F6 3D Secure kullanımı'),
  f('3D Secure', 'id', ['S1'], 'F6 ödeme güvenliği yönteminin adı'),
  f('%29,2', 'R', ['S1'], 'F6 havale/EFT payı'),
  f('%3,5', 'R', ['S1'], 'F6 kapıda ödeme payı'),
  f('388,7 milyar TL', 'R', ['S1'], 'F7 hızlı ticaret hacmi'),
  f('%8,5', 'R', ['S1'], 'F7 hızlı ticaretin toplamdaki payı'),
  f('21,8 milyar TL', 'R', ['S1'], 'F7 C2C hacmi'),
  f('C2C', 'id', ['S1'], 'Tüketiciden tüketiciye ticaret kısaltması'),
  f('12 Mayıs 2026', 'R', ['S1'], 'Rapor duyuru tarihi'),

  // --- F9–F10: cayma hakkı (6502, Ticaret Bakanlığı; resmi özet)
  f('14 gün', 'R', ['S14', 'S15'], 'F9 cayma süresi'),
  f('1 yıl', 'R', ['S14'], 'F10 ön bilgi verilmezse cayma süresinin uzayabileceği üst sınır'),

  // --- F11: Mesafeli Sözleşmeler Yönetmeliği değişikliği (iki bağımsız ikincil kaynak, S16 + S17)
  f('24 Mayıs 2025', '2İ', ['S16', 'S17'], 'F11 Resmî Gazete yayım tarihi'),
  f('32909', '2İ', ['S16', 'S17'], 'F11 Resmî Gazete sayısı'),
  f('1 Ocak 2026', '2İ', ['S16', 'S17'], 'F11 yürürlük tarihi'),

  // --- F12–F13: e-Fatura geçiş eşikleri (iki bağımsız ikincil kaynak; KB S9 + S10, sitede gösterilmez)
  f('3 milyon TL', '2İ', ['S9', 'S10'], 'F12 genel brüt satış hasılatı eşiği'),
  f('500 bin TL', '2İ', ['S9', 'S10'], 'F13 internet ortamında satış eşiği'),
  f('1 Temmuz', '2İ', ['S9', 'S10'], 'F12 eşiği aşılan yılı izleyen yılda geçiş günü'),

  // --- F17: e-İrsaliye kapsamı (GİB e-Belge, resmi)
  f('25 milyon TL', 'R', ['S8'], 'F17 e-İrsaliye kapsamı: önceki dönem brüt satış hasılatı'),

  // --- F18–F19: VERBİS (KVKK Kurulu kararları, resmi)
  f("50'den az", 'R', ['S19'], 'F18 çalışan sayısı sınırı'),
  f('100 milyon TL', 'R', ['S19'], 'F18 yıllık mali bilanço sınırı'),
  f('10 milyon TL', 'R', ['S19'], 'F18 özel nitelikli veri ana faaliyetse bilanço sınırı'),
  f("10'dan az", 'R', ['S19'], 'F18 özel nitelikli veri ana faaliyetse çalışan sınırı'),
  f('2025/1572', 'R', ['S19'], 'F18 Kurul karar numarası'),
  f('4 Eylül 2025', 'R', ['S19'], 'F18 Kurul karar tarihi'),
  f('30 gün', 'R', ['S20'], 'F19 yükümlülüğün doğmasından itibaren kayıt süresi'),

  // --- Mevzuat ve belge kimlikleri (sayı değil, ad): kaynakları resmi
  f('6502', 'id', ['S13', 'S14'], 'Tüketicinin Korunması Hakkında Kanun numarası'),
  f('6563', 'id', ['S24', 'S27'], 'Elektronik Ticaretin Düzenlenmesi Hakkında Kanun numarası'),
  f('6698', 'id', ['S19'], 'Kişisel Verilerin Korunması Kanunu numarası'),
  f("509 Sıra No'lu", 'id', ['S5', 'S6'], 'VUK Genel Tebliği sıra numarası'),
  f('IV.1.4', 'id', ['S5'], 'Tebliğin e-Fatura geçiş bölümü'),
  f('SP-API', 'id', ['S40'], 'Amazon Selling Partner API adı'),
  f('N11', 'id', [], 'Pazaryeri adı (site geneli NUMERIC_ALLOWLIST ile aynı)'),
  f('n11', 'id', [], 'Pazaryeri adı (küçük harf yazımı)'),
  f('2025', 'id', ['S1'], 'Raporun kapsadığı yıl'),
  f('2026', 'id', ['S1'], 'Güncelleme/rapor yılı'),
]

/** Sayfa meta tarihleri (ISO) rakam denetiminden muaf alanlardır; metin içinde tarih ancak belirteçle yazılır. */
export const DATE_KEYS = new Set(['datePublished', 'dateModified', 'reviewBy', 'accessed'])
