# Agentic (Otopilot) Paketleme ve Fiyatlama Araştırması — 2026-10-01

> IÇ KULLANIM. Rakip adları yalnızca bu raporda geçer; sitede ve herkese açık metinde rakip adı kullanılmaz.
> Etiketler: [KANIT] = kaynakta doğrudan görüldü; [DOLAYLI] = ikincil/blog kaynağı; [TAHMİN] = bizim çıkarımımız.

## 1. Yönetici özeti

- Türkiye pazaryeri entegrasyon yazılımlarında AI henüz dar kapsamlı (kategori eşleme, ürün ekleme, asistan/rapor) ve ağırlıklı olarak **ayrı ücret alınmadan paketin içinde** sunuluyor. Sohbetle yönetilen, çok adımlı "operasyon ajanı" yerel rakiplerde görünmüyor [KANIT: sayfa taramaları, aşağıda]. Bu, konumlandırma için açık alan.
- Global e-ticaret operasyon araçlarında (Shopify, Linnworks) AI temel aboneliğe dahil; ayrıca ücretlendirilen yalnızca sonuç bazlı kanal (AI sohbetinde satış) [KANIT/DOLAYLI].
- Genel B2B SaaS'ta iki akım var: (a) hızlı ayrı ücretlendirme/kredi (HubSpot, Salesforce), (b) AI'ı üst plana gömüp eklentiyi kaldırma (Notion, Microsoft) [KANIT]. Eklentinin kalıcı olmadığına dair işaret güçlü.
- BYOK modelinde standart uygulama: platform yalnızca lisans alır, model maliyeti müşteri-sağlayıcı arasındadır; BYOK genelde **daha düşük** platform ücreti ile anılır [KANIT: Langdock].
- Bizde değişken LLM maliyeti yok; ayrı eklenti fiyatını haklı çıkaran marjinal maliyet yok. Eklentinin tek gerekçesi "gelir/ARPU" olur, maliyet telafisi değil.
- **Öneri: Seçenek B (kademeli dahil).** Ayrıntı bölüm 5.

## 2. Bulgular tablosu

### 2.1 Türkiye

| Oyuncu / kategori | AI özelliği | Paketleme | Kaynak (erişim 2026-10-01) |
|---|---|---|---|
| Entegra (entegrasyon paketleri, yıllık 24.750-150.000 TL) | "Yapay zeka ile ürün ekleme" Paket 0'da; "rekabet analizi - otomatik fiyatlandırma" Paket 3'te; e-ticaret Profesyonel pakette "ChatGPT reklam yönetimi" | Kademeli dahil, ayrı AI ücreti görünmüyor [KANIT] | https://www.entegrabilisim.com/paketler |
| Sentos (Basic 9.500 - Platinum 89.000 TL/yıl) | 135 özellik listesinde AI yok; "Otomatik Fiyat Robotu" kural tabanlı | AI iddiası yok [KANIT] | https://www.sentos.com.tr/fiyatlar/ |
| Sopyo | Trendyol/Hepsiburada akışında "yapay zeka destekli" eşleme ve toplu güncelleme | Fiyat sayfası okunamadı; paketleme belirsiz [KANIT kısmi] | https://www.sopyo.com/entegrasyonlar |
| Dopigo | Hepsiburada kategori eşleme ve zorunlu özellik doldurmada AI | Ayrı AI fiyatı bulunamadı [DOLAYLI, arama özeti] | https://www.dopigo.com/hepsiburada-entegrasyonu/ |
| MixAPI.store | "Mix AI": günlük rapor, stok uyarısı, fiyat önerisi, kategori eşleme, WhatsApp üzerinden Türkçe destek; Starter 1.490 TL/ay | **Tüm ücretli planlara dahil**, Free'de yok [KANIT] | https://mixapi.store/ |
| Ticimax, İdeasoft (e-ticaret altyapıları) | Arama sonuçlarında AI paketleme bilgisi bulunamadı | Bilinmiyor | https://www.ticimax.com/e-ticaret-pazaryeri-entegrasyonlari/ |

Not: Yerel rakiplerin hiçbirinde "BYOK" veya çok adımlı ajan/otopilot paketi görmedik. Bu bir eksik-kanıt bulgusudur (tam tarama yapılmadı; fiyat sayfaları çoğunlukla dinamik).

### 2.2 Global e-ticaret operasyon araçları

| Oyuncu | Paketleme | Kaynak |
|---|---|---|
| Shopify (Sidekick, Magic) | Tüm ücretli planlara dahil, ek satır yok; "Agentic" planı $0/ay, yalnızca AI kanalında satış kapanınca ücret (sonuç bazlı) [DOLAYLI] | https://eesel.ai/blog/shopify-ai , https://www.polaranalytics.com/post/shopify-ai-features-tools-agents |
| Linnworks (Spotlight AI) | Çekirdek planlara dahil; plan sipariş hacmine göre, "yüzde komisyon yok"; ayrıca ileri işlevler için isteğe bağlı eklenti modülleri (AI ayrımı net değil) [KANIT kısmi] | https://www.linnworks.com/pricing/ |
| Feedonomics (yönetilen hizmet) | Yaklaşık $2.200/ay, AI'a özgü paket bilgisi yok [DOLAYLI] | https://wiserreview.com/blog/feedonomics-alternatives/ |

### 2.3 Genel B2B SaaS

| Bulgu | Kaynak |
|---|---|
| SaaS şirketlerinin %41'i AI'ı resmen paraya çeviriyor; bunların %53'ü abonelik, %11'i saf kullanım, %31'i hibrit. %73 "AI ek ücreti" duyurmuş/getirmiş. AI'lı katmanlarda tipik %20-40 prim. Kaynak Zylo/High Alpha verisine atıf yapıyor, örneklem belirtilmemiş [DOLAYLI] | https://research.stripo.email/saas-pricing-trends-2026 |
| HubSpot Breeze: kredi modeli; çözülen görüşme başına ~$0.50, nitelikli lead başına ~$1, Data Agent yanıtı ~$0.10; ek kredi 1.000'i $10'dan [DOLAYLI] | https://www.eesel.ai/blog/how-much-does-hubspot-ai-really-cost ; https://www.hubspot.com/products/artificial-intelligence/credits |
| Salesforce Agentforce başlangıçta görüşme başına $2; karmaşık görüşmelerde müşteri şikayeti [DOLAYLI] | https://valueiq.substack.com/p/four-perspectives-on-credit-based |
| Notion: Mayıs 2025'te AI eklentisini kaldırdı, Business planı $18'den $24'e çıkardı, AI'ı pakete gömdü (yürürlük 13 Ağustos 2025) [DOLAYLI] | https://www.getmonetizely.com/articles/how-much-does-notion-ai-cost-a-complete-guide-to-pricing-plans-for-productivity-boosters |
| Microsoft 365 tüketici: Copilot'u pakete gömüp ~%30 zam; "Classic" AI'sız plan seçeneği; Avustralya'da bu uygulama nedeniyle dava açıldı [KANIT/DOLAYLI] | https://www.maginative.com/article/microsoft-bundles-copilot-ai-into-consumer-microsoft-365-marks-first-price-increase-in-12-years/ ; https://www.khaleejtimes.com/business/tech/australia-sues-microsoft-ai-linked-subscription-price-hikes |
| Token fiyatı yıllık %80 düşerken toplam AI harcaması %320 arttı (kullanım hacmi büyüdü) — kredi/kullanım bazlı faturada tahmin edilemezlik riski [DOLAYLI] | Stripo raporu (yukarıda) |

### 2.4 BYOK örnekleri

| Örnek | Model | Kaynak |
|---|---|---|
| Langdock | İki seçenek: modeli kendimiz karşılarız (yüksek koltuk fiyatı) veya BYOK (düşük koltuk fiyatı). "Model sağlayıcısına doğrudan, Langdock'a yalnızca platform lisansı öder." Fark rakamı yayınlanmamış. | https://docs.langdock.com/settings/models/byok |
| Cline | Açık kaynak, BYOK, yazılım ücreti yok; kurumsal katman ücretli | https://fast.io/resources/cline-pricing-guide/ |
| Cursor | Ücretli paket $20/ay; ücretsiz planda kendi anahtarını kullanma izni | https://pricepertoken.com/coding-assistants/compare/cline-vs-cursor |
| Genel tanım | Yazılım maliyetini değişken LLM maliyetinden ayırır; platform riski azalır, müşteriye şeffaflık artar | https://kinde.com/learn/billing/billing-for-ai/byok-pricing/ |

### 2.5 Müşteri algısı ve dönüşüm

- Tüketici tarafında kanıt: ABD'de yetişkinlerin %71'i AI asistan özelliği için ek ödemez; telefon sahiplerinin %50'si ek ödemez (2024'te %45) [DOLAYLI, eMarketer/Rev]. https://www.emarketer.com/content/consumers-unwilling-pay-ai-features-1 , https://www.rev.com/blog/how-much-is-ai-worth . Bu B2B değil; yön göstergesi olarak kullan.
- Microsoft örneği: zorunlu gömme zam algısı ve hukuki tepki doğurdu; "AI'sız Classic" seçeneği sunuldu [KANIT]. Ders: dahil etmek fiyat artışıyla birlikte yapılırsa tepki çeker.
- B2B'de bundling vs eklenti için dönüşüm/churn etkisini ölçen, örneklemi belli bir çalışma **bulamadık**. Bu konuda kanıt yok; aşağıdaki çıkarımlar [TAHMİN].
- Dikkat: Stripo raporundaki %20-40 prim, satıcı maliyeti (token) taşıyan modeller için; BYOK'ta aynı prim gerekçesi zayıf [TAHMİN].

## 3. Seçenekler

### A: Tüm planlara dahil
Artı: En basit anlatım; Türkiye'de rakip eşiği (MixAPI tüm ücretli planlarda, Entegra paket içinde) ile uyumlu; Shopify/Linnworks ile aynı yön; deneme ve benimsenme yüksek, ajan kullanımı veri/ürün öğrenmesi üretir; LLM maliyeti müşteride olduğundan bizde marjinal maliyet ~0 (destek, altyapı, kuyruk/Redis ve pazaryeri API çağrısı hariç).
Eksi: Üst plana geçiş için güçlü bir kaldıraç kaybolur; yükselen pazaryeri API/iş kuyruğu yükünü (ajan eylemleri) fiyatlamadan taşırız; "BYOK zahmeti" kullanım bariyerini düşürmez, dahil olsa da kurulum gerekir.

### B: Üst planlara dahil + alt planda sınırlı
Artı: Notion/Entegra/Linnworks kademeli yaklaşımıyla uyumlu; alt planda "tadımlık" (salt okuma/öneri, sınırlı günlük eylem) sunup yazma yetkili otopilotu üst plana bağlamak yükseltme yolu açar; ajan eylemlerinin pazaryeri API yükü plan sınırlarıyla orantılanır; ayrı fatura kalemi yok (MS tarzı tepkiden kaçınılır, çünkü mevcut müşteriden alınan bir şey geri çekilmiyor, yeni yetenek ekleniyor).
Eksi: Kademe sınırını açıklamak gerekir; sınır yanlış seçilirse alt plan "kısıtlı" algılanır; bir miktar ürün/mühendislik işi (kota, plan denetimi).

### C: Ayrı eklenti
Artı: Net ek gelir kalemi; istemeyen ödemez.
Eksi: BYOK'ta kullanıcı zaten LLM'i ayrıca ödüyor, "iki kez ödeme" algısı doğar [TAHMİN]; Notion gibi büyükler eklentiden pakete gömmeye döndü [KANIT]; yerel rakipler AI için ayrı fatura kalemi kullanmıyor (görebildiğimiz kadarıyla); dönüşüm verisi yok; fatura/fiyat sayfası karmaşıklaşır; bizde marjinal maliyet yok, bu nedenle fiyat gerekçesi zayıf.

## 4. Maliyet mantığı (BYOK etkisi) — [TAHMİN]

- LLM çıkarımı müşteri hesabında; bizim değişken maliyetimiz: ajan eylemlerinin tetiklediği pazaryeri API çağrıları, kuyruk/Redis/depolama, destek yükü, anahtar saklama (AES-256-GCM, mevcut altyapı).
- Bu yüzden kredi/kullanım bazlı (HubSpot tipi) fiyat gerekmez; "kredi bitti" sürtünmesi ve faturalama öngörülemezliği (token harcaması %320 artışı bulgusu) bizi ilgilendirmez.
- Kontrol gereği: ajan eylemi başına pazaryeri API rate limit'i ve günlük eylem üst sınırı plan bazında konmalı; bu hem güvenlik (yanlış toplu fiyat/stok yazımı) hem maliyet koruması sağlar.

## 5. Öneri: Seçenek B

Gerekçe:
1. **Pazar uyumu ve fark yaratma:** Yerel rakiplerde AI ya dar ya da dahil; ayrı eklenti kalemi yok. Ajanı dahil sunmak normla uyumlu, çok adımlı ajan ve sohbetle yönetim ise rakiplerde görülmüyor; fark özellikte, fiyat kaleminde değil.
2. **BYOK nedeniyle marjinal maliyet düşük:** Eklenti fiyatını haklı çıkaran LLM maliyeti yok; müşteri LLM'i zaten ödüyor, ikinci ücret "çifte ödeme" algısı yaratır. Buna karşılık pazaryeri API yükü ve yazma yetkili eylemler risk taşıdığı için kademeli sınır mantıklı.
3. **Yükseltme yolu:** Alt planda öneri/okuma ve düşük günlük eylem kotası, üst planda tam otopilot (yazma yetkisi, zamanlanmış görevler, yüksek kota). Notion ve Entegra bu desenle hareket ediyor [KANIT]; kredi bazlı karmaşıklık yok.

Kademe önerisi (eşikler [TAHMİN], ürün/plan yapısına göre ayarlanacak):
- Alt plan: sohbetle sorgulama, raporlama, öneri (insan onaylı), günlük sınırlı eylem.
- Orta/üst plan: otonom eylem (onay kuralları ile), zamanlanmış operasyon ajanları, yüksek eylem kotası, çok mağaza.
- Hiçbir planda "AI kredisi" veya ayrı AI faturası yok; LLM maliyeti sağlayıcıya (BYOK) gider.

Risk: Kademe sınırının kanıtı yok (dönüşüm verisi bulunamadı). Önerilen doğrulama: ilk 2-3 ay alt/üst plan kullanım ve yükseltme verisini izle; gerekirse alt planı genişlet (Seçenek A'ya kayma kolay, tersi zor).

## 6. Sitede nasıl anlatılır (reklam dili, rakipsiz)

- Öneri metni (1-2 cümle): "Otopilot, operasyon ajanlarınızı sohbetle yönetmenizi sağlar; kendi yapay zekâ anahtarınızı getirirsiniz, bu yüzden yapay zekâ için bize ekstra ücret ödemezsiniz. Her pakette başlayın, büyüdükçe ajanlarınıza daha fazla yetki verin."
- Plan tablosunda tek satır: "Otopilot — Başlangıç: sor ve öner; Pro ve üzeri: kendi başına çalışır."
- İpucu: "Kendi anahtarınız, kendi kontrolünüz, LLM faturanız doğrudan sağlayıcıdan" vurgusu şeffaflık (veri/maliyet) mesajıdır; tüketici verisinde AI şeffaflığına ~%7 prim ödeme eğilimi görüldü (DHL/ikincil kaynak, güvenilirliği sınırlı; sitede rakam kullanma).
- Kaçın: "sınırsız AI", "ücretsiz AI" (LLM maliyeti müşteride; yanıltıcı olabilir), kredi/token dili.

## 7. Sınırlar ve açık noktalar

- Türkiye: Ticimax, İdeasoft, Dopigo, Sopyo fiyat sayfalarında AI paketleme ayrıntısı doğrulanamadı.
- Shopify ve Linnworks kaynaklarının çoğu ikincil bloglar; resmi fiyat sayfaları tam okunamadı.
- Bundling vs eklenti dönüşüm kanıtı yok; öneri kısmen [TAHMİN]'e dayanır.
- Rakip fiyatları 2026-10-01 tarihlidir, değişebilir.
