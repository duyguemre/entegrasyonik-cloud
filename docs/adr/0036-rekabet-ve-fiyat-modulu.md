# 0036 — Rekabet ve fiyat modülü: resmi veriyle görünürlük, satıcı kuralıyla öneri, hukuk kapılı otomasyon

## Durum
Kabul edildi (2026-10-01). Kod: PRC-R0/CFG/R1 bulutta (`cloud/prc-r1`), PRC-R2 sırada (`cloud/prc-r2`), PRC-R3 **kapalı** (avukat yanıtı bekliyor).
Kullanıcı kararları: K56, K57, K58 (`docs/adr/USER_DECISIONS.md`). Kaynaklar: `docs/research/COMPETITION_PRICING_2026-10.md`, `docs/research/AUTO_PRICING_LEGAL_2026-10.md`. Backlog: `BACKLOG.md` → PRC-*.

**İlişkiler:** ADR-0018 (ajan eşikleri, gölge mod, deterministik karar), ADR-0019 (tek yetenek kaydı, ekran = Otopilot/MCP), ADR-0029 (bildirim kataloğu), ADR-0031 (çalışma zamanı ayarları), ADR-0033 (adaptör manifestosu/`unsupported`). Yeni servis yok: rekabet kuralı B-10 kanal fiyat kuralının bir **tipi**dir.

## Bağlam
- Satıcılar buybox/rakip fiyat görünürlüğü ve fiyat robotu istiyor; TR'de orta-üst pakette beklenen özellik.
- Resmi rakip sinyali yalnız Trendyol buybox ucunda doğrulandı (≤10 barkod/istek, paylaşımlı kota). HB/N11/Pazarama'da bulunamadı.
- Rekabet Kurulu pazaryeri araçlarında "buybox'a eşitle" ve 0 farkı kaldırttı; bize özgü en büyük risk, birbirine rakip tenant'lara aynı motoru sunmamızdan doğan topla-dağıt (hub-and-spoke) riskidir.
- İndirim gösterimi "son 10 gün en düşük fiyat" kuralına bağlı; otomatik sık değişim bunu bozabilir.

## Kararlar

### Mimari
1. **Veri kaynağı yalnız resmi API ve satıcının kendi ürünü.** Kazıma yok (K57-S2). Ucu olmayan kanal manifestoda `unsupported`; arayüz "desteklenmiyor" der ("yakında" demez).
2. **Rekabet motoru ayrı servis değil.** B-10 fiyat kuralının tipi; öneri kuyruğu B-15/B-17 ile ortak (çift kuyruk yok).
3. **Deterministik karar.** Fiyatı kod (kural + sigorta) hesaplar; yapay zekâ yalnız açıklar ve özetler.
4. **Tek yetenek kaydı.** `pricing.buybox.list`, `pricing.margin.preview` (read), `pricing.rules.*` (write/admin), `pricing.suggestions.list` (read), `pricing.suggestions.apply` (write, PendingAction). Ekran, Otopilot ve MCP aynı kayıttan.
5. **Tenant izolasyonu mutlak.** Anlık görüntü, geçmiş, maliyet ve kurallar yalnız ilgili ClientDB'de; motor başka tenant verisi okuyamaz (statik + izolasyon testi). Rakip kimliği saklanmaz; anlık görüntü TTL ~90 gün.
6. **Yük ve adalet ayardan.** SKU tavanı, tazeleme aralığı, tazelik eşiği, öncelik politikası (plan varsayılanı + tenant istisnası) ve kanal başına global çağrı bütçesi ADR-0031 kataloğunda; backoffice'ten yeniden başlatmasız değişir. Bütçe dolunca tazeleme ertelenir, tenant'lar adil sırayla; müşteri "son güncelleme / sonraki tazeleme"yi görür (K57-S5).
7. **Maliyet zorunlu.** `Variants.costPrice`; maliyet yoksa öneri/kural çalışmaz, yalnız uyarı (K57-S4).

### Hukuk kaynaklı tasarım kuralları (asgari çıta)
`AUTO_PRICING_LEGAL_2026-10.md` §(c) K1-K20 R2'de de uygulanır; en kritikleri kural adlı testlerle kilitlenir:
eşitleme yok ve fark > 0 (K1); tenant'lar arası veri yok (K2); varsayılan kapalı + sorumluluk onayı (K3); önerilen fark dayatılmaz (K4); rakip hedefleme alanı yok (K6); zorunlu taban/tavan (K7); yukarı yönlü artış sınırı (K8); liste/üstü çizili fiyat asla yükseltilmez, indirimdeki ürüne dokunulmaz (K9); ≥30 gün gerçekleşen fiyat geçmişi (K10); "indirim" dili üretilmez (K11); sıklık/soğuma (K12); bayat veriyle işlem yok (K13); denetim kaydı (K18); platform/tenant/kural kill-switch (K19).

### İş (business)
1. **Aşamalar:** R0 maliyet → R1 görünürlük (yalnız Trendyol) → R2 öneri + insan onayı → R3 insan onaysız otomatik.
2. **R3 kapısı:** avukat yanıtı (LEGAL §e S1, S2, S5, S8) + Trendyol sözleşmesinin insan tarafından okunması + R2'nin ≥4 hafta kullanımı + 14 gün gölge mod. Bu koşullar sağlanmadan kodda insan onaysız yol bulunmaz.
3. **Paketleme:** R1 tüm planlarda sınırlı, R2 tam hali üst planlarda, R3 en üst planlarda; somut sayılar ayardır, fiyat değerleri Protokol 12.
4. **Pazarlama:** sitede yalnız ilke dili ("fiyatınız sizin kuralınızla", "verileriniz yalnız sizin", "şeffaf kayıt", "adil rekabet"). Hukuki garanti, Kurul kararı/pazaryeri adı, rakip adı, "eşitle/rakibi yen" dili ve yayında olmayan özellik vaadi yasak; statik metin bekçisi korur (K58, K43).
5. **Kanal genişlemesi:** diğer kanallar yalnız resmi uç kanıtıyla (PRC-CH, insan görevi: satıcı desteğine soru).

## Sonuçlar
- Artı: hukuken savunulabilir, sistemi yormayan, sonradan ayarla şekillenen bir modül; mevcut yetenek/onay/bildirim altyapısını yeniden kullanır.
- Eksi: başlangıçta yalnız Trendyol → satış argümanı dar; maliyet girişi kullanıcıya iş yükü.
- Açık kararlar: PRC-OPEN (S6 toplu onay kotası, S8 LIVE_READONLY'de buybox ucu, S9 satıcı görüşmeleri, S10 site zamanlaması).

## Gözden geçirme tetikleyicileri
Avukat yanıtı geldiğinde; mevzuat (Fiyat Etiketi / Haksız Ticari Uygulamalar) veya Kurul kararı değiştiğinde; yeni kanalda resmi uç bulunduğunda; Trendyol API sürüm geçişinde.
