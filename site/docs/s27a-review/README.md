# S27a inceleme — anasayfa (SR4 madde 1–8) + NEXT_TASKS N3, N5, N7, N8, N9

Dal: `cloud/site-s27a` (taban `origin/main`; sonda `cloud/site-s27b` birleştirildi). Yalnız `site/` değişti.
Kaynaklar: `docs/cloud-contracts/SITE_FEEDBACK_R4_2026-10-01.md` (K50), SR3, USER_DECISIONS K39/K43–K46, `site/docs/elev/{BRAND,AUDIT,NEXT_TASKS}.md`.
Görüntüler bulutta Linux Chromium ile, reduced-motion (anlamlı son kare) ile; tam sayfa 1800 px dilimler. Otopilot anı
görüntüleri hareket açıkken animasyon zamanına sabitlenerek alındı (`otopilot-ani-*-<ms>`). Görsel onay yerelde.

| Klasör | İçerik |
|---|---|
| `once/` | Taban: anasayfa 1440 (p0–p9) / 390 (p0–p15); `ozellikler-kumeler-*`, `trendyol-diger-*`, `otopilot-demo-*` |
| `sonra/` | Aynı kareler bu turdan sonra + `otopilot-ani-*` (vitrinin 4. sahnesi) |
| `iterasyon/` | Ara durumlar (eleştiri notları aşağıda) |

## Yapılanlar (madde → çözüm)

| # | Geri bildirim | Çözüm | Görüntü |
|---|---|---|---|
| SR4-1 | Hero karşılama ekranı; dört kutu hero'dan çıksın, açık zeminde | Hero yalnız: duyuru hapı + H1 + tek cümle + iki CTA + deneme notu + vitrin. "Tek merkez / Eşzamanlı stok / 14 gün ücretsiz / Kurumsal güvenlik" hero BİTTİKTEN sonra açık zeminde kartsız "olgu şeridi" (dört sütun, saç çizgisi ayraç, ikon + başlık + tek satır). Kayan yetenek şeridi (marquee) kaldırıldı — aynı işler Yetenekler'de listeleniyor ve ekranda ikinci döngüydü | `once/anasayfa-1440-p0` → `sonra/anasayfa-1440-p0` |
| SR4-2 | Otopilot daha albenili | Vitrin büyüdü: display ölçeğinde ad (gradyan vurgu — tek koyu vitrin kartı istisnası), konsol dört ajanın tamamı (ad + ne yaptığı + durum rengi), arkada yörünge halkaları/ışıma, onay kapısı öne taşan kart; üç adım oklu BAĞLI akış, karar adımı vurgulu. Sorun–çözüm kartında 4. madde "Otopilot takipte" (kayıttan) | `sonra/anasayfa-1440-p3`, `iterasyon/it2-…otopilot-vitrini` |
| SR4-3 | Operasyon merkezi animasyonunda Otopilot anı | Hero vitrininin 4. sahnesi "Güvenlik" → **Otopilot**: "Stok farkı bulundu" sinyali → öneri kartı (kanal başına farklı eski değer → eşit yeni değer, rakamsız) → "Onayla" basılır → "Onaylandı" → kanal satırlarında onay → "Uygulandı · tüm kanallar güncel". Stok hikâyesi (sahne 1–3 + S26 perdeleri) aynen. Reduced-motion/statik: 1. sahnenin son karesi (stok 9 / rezerve 3) — anlamlı kare değişmedi | `sonra/otopilot-ani-1440-{23500,25500,26800,29000}`, `-390-*` |
| SR4-4 | Planlarda Otopilot (K46) | Her plan kartında "Otopilot dahil" bloğu: alt plan temel küme ("Sınırlı günlük işlem"), üst planlar "<önceki> planındakilere ek olarak". Kayıt: s27b'nin ortak `getPlanCards()` (plan-cards.ts ← pricing.ts) — fiyat sayfasıyla aynı. Üstte "Otopilot her planda" hapı, altta "Yapay zekâ için ayrıca ödeme yok" notu. Rakam/kredi/token yok | `sonra/anasayfa-1440-p5` |
| SR4-5 | Şifreleme/izole ortam metni güvenlik bölümüne | Yetenekler'deki iki güvenlik karosu (şifreli anahtar, izole veri) ve sorun–çözüm kartındaki "Kurumsal düzeyde güvenlik" maddesi kaldırıldı; anlatı yalnız Güvenlik bölümünde. Kapanış çiplerinden de güvenlik tekrarları çıktı. Fiyat kartı altındaki güvence satırı (kart/rol/izole) kaldırıldı | `sonra/anasayfa-1440-p2`, `-p6` |
| SR4-6 | Yetenekler + Günlük işler birleşimi | **KARAR: birleştirildi** (aşağıda gerekçe) | `sonra/anasayfa-1440-p2` |
| SR4-7 | "Yetenek kümeleri" üst standart (`/ozellikler`) | Hap bulutu yerine numaralı "içindekiler" şeridi (CSS sayacı — sayfada rakam metni yok); her küme numaralı panel (gradyan büyük numara + başlık + açıklama, kümeler arası saç çizgisi); kartlarda hover'da üst marka çizgisi; sarı "Kapsam notu" kutusu sakin nota (nötr zemin + solda uyarı çizgisi) — şeffaflık metni aynen | `once/ozellikler-kumeler-*` → `sonra/ozellikler-kumeler-*` |
| SR4-8 | "Diğer entegrasyonlar" tasarımı (`/entegrasyonlar/[kod]`) | Hap satırı → kart ızgarası: kanal rozeti + ad + tür (kayıttan `kindLabel`) + ok; hover'da kanal renginde ince üst çizgi (K13: renk yalnız kanal kimliği); başlık satırında "Tüm entegrasyonlar →"; dar ekranda 2 sütun | `once/trendyol-diger-*` → `sonra/trendyol-diger-*` |
| N3 | Anasayfa kurgusunu kısalt | 1440: **16.884 → 14.168 px** (−%16); 390: 28.250 → 22.937 px. "Bir sipariş geldiğinde ne olur" ~2.000 px → tek ekran yatay zaman çizgisi (5 adım + kayıt bağları aynen); güvenlik koyu 4 kart → açık zeminde kompakt satırlar + tek koyu vitrin paneli; Nasıl çalışır açık zemine. Koyu sahneler: hero, Otopilot vitrini (kart) ve kapanış | tüm `sonra/anasayfa-*` |
| N5 | Kanıtlanabilir güven şeridi | Hero sonrası şerit: her öğe `data-source` ile kayda bağlı (yetenek kimlikleri / deneme kaydı), test kaynağın yayımlandığını doğrular. Kanal sayısı kullanılmadı (S12 kullanıcı kararı: "uygulanan entegrasyon sayısı" gösterilmez) | `sonra/anasayfa-1440-p0` |
| N7 | Otopilot demo kartı sadeliği | Üç eylem korundu (e-posta istemcisi olmayan için kopyala), hiyerarşi netleşti: tek birincil "Demo talep edin"; "Adresi kopyala" metin bağlantısı ağırlığında; "Hemen başlayın" ayraç altında küçük ikincil bağlantı. Paylaşılan `EmailActions` bileşenine dokunulmadı (kapsam yalnız bu kart) | `once/otopilot-demo-*` → `sonra/otopilot-demo-*` |
| N8 | Mobil hero | 390'da ilk içerik bölümüne **~1,34 ekran** (taban ~1,9): fayda kutuları ve kayan şerit hero dışında; vitrinde sahne göstergesi ve sipariş satırları, Otopilot sahnesinde fark önizlemesi gizli | `sonra/anasayfa-390-p0` |
| N9 | Hareket ekonomisi | Kaldırılan sürekli döngüler: kayan şerit, bento karolarının tümü (stok/sipariş/kanal/anahtar/kiracı), sipariş hikâyesi mini sahneleri ve paket akışı, ekosistem yörünge dönüşü, güvenlik halka/kadran dönüşü. Bento ve hikâye yalnız tek seferlik giriş. Kalan döngüler: hero vitrini, sıfır aşırı satış hikâyesi, ekosistem akış paketleri, güvenlik tarama ışını, fiyat vurgusu ve kapanış halkaları — her biri kendi ekranında tek | — |

### Karar: "Yetenekler" + "Günlük işler" birleşti (SR4-6)
İkisi aynı mesaj sütununa (Kontrol) hizmet ediyor ve aynı kayıttan (`capabilities.ts`) besleniyordu; ayrı başlıklı iki katman
ziyaretçiye "ikinci bir özellik listesi" gibi okunuyordu (AUDIT A10). Biri tamamen kaldırılsaydı ürün kataloğu, iade, soru,
hakediş, kargo/fatura ve ERP anasayfadan düşerdi. Bu yüzden: **tek bölüm, tek H2** ("Siparişten iadeye, işinizin tamamı");
üstte üç vitrin karosu (rezervasyon, birleşik sipariş, tek merkez), altında aynı bölümde kompakt "Günlük işleriniz de aynı
ekranda" listesi (ikon + başlık + tek satır; kart ve illüstrasyon yok). Bölüm ~2.900 → ~1.700 px.

### Karar: sıra
Bölüm sırası değişmedi (Otopilot, Entegrasyonlar ile Nasıl çalışır arasında). Otopilot'u yukarı almak açık/gri zemin
ritmini bozuyordu (iki gri bölüm art arda); albeni yerleşimle değil vitrinin kendisiyle ve hero vitrinindeki anla sağlandı.

## İterasyonlar ve sert eleştiri

1. **Hero + şerit (it1).** Otopilot sahnesinde eski/yeni çubuklar eşit uzunluktaydı → "fark" okunmuyordu (`iterasyon/it1-otopilot-*`).
   → Eski değerler kanaldan kanala farklı uzunlukta (biri uyarı renginde), yeni değerler eşit. 390'da vitrin sipariş satırları
   gizlenince sahne yüksekliği en uzun sahneden (Otopilot) geldiği için altta boşluk kaldı → Otopilot fark önizlemesi dar ekranda gizlendi.
2. **Kurgu kısaltma (it2).** Kompakt zaman çizgisinde düğümleri bağlayan hat görünmüyordu: CSS değişkenleri alt bileşene
   (`<Section class>`) kapsamlı seçiciyle verilmişti → tanımsız → degrade geçersiz. Değişkenler bileşenin kendi öğesine taşındı.
   Otopilot vitrinindeki adım okları kısa çizgi gibi duruyordu → hat + uç, sütun sağ boşluğu arttı. Güvenlik vitrin panelinde iki
   sütunlu çipler üç satıra kırılıyordu → geniş ekranda tek sütun.
3. **Bütün sayfa (it3).** Kapanış çiplerinde "Şifreli anahtar saklama / Verileriniz yalnızca size ait" tekrarı (N3 "her güvenlik
   iddiası bir kez") → kaldırıldı. `/ozellikler` küme numaraları ve "N yetenek" sayacı `pages.test` "görünür metinde sabit rakam yok"
   kuralına takıldı → numaralar CSS sayacıyla çiziliyor, sayaç kaldırıldı (kural gevşetilmedi).
4. **Birleştirme.** s27b ile çakışma yok. s27b'nin `fiyatlandirma.astro`'sunda ad sabiti yerine düz "Otopilot" yazılmıştı
   (`agent-claims.test` S22 kuralı kırmızı) → iki satır `${AGENT_BRAND}` yapıldı. Anasayfa planları s27b'nin `getPlanCards()`
   kaydına bağlandı; taslak notu s27b'nin N4 varsayılanını izliyor (görünür ziyaretçi dili, iç kayıt `data-proposal-notice`).

Kalan / bilinçli bırakılan:
- **N3 hedefi (≤ 12.000 px) tam tutmadı: 14.168 px.** En büyük kalem "Nasıl çalışır" (~2.300 px; dört mini arayüz). Kısaltmak
  için mini arayüzleri küçültmek ya da 2×2 ızgaraya almak gerekir — yapışkan anlatı (S7) kullanıcının onayladığı bir imza olduğu
  için bu turda dokunulmadı; sonraki tur adayı.
- Nasıl çalışır 2. adım metni anahtarların şifreli saklandığını bağlam içinde söylüyor (kanal bağlama adımının parçası); tekrar sayılmadı.
- N4 kararı s27b'de `site/docs/s27b-review/DECISIONS_PENDING.md` ile kullanıcıda.
- `USER_DECISIONS.md` bulutta salt okunur (`docs/adr/`, kural 7); SR4-6 birleştirme kararı burada belgelendi — yerelde K50 satırına bağlanmalı.

## Test değişiklikleri (gerekçeli; iddia/kanıt korumaları gevşetilmedi)

- `home.test.ts`: fayda rayı testi → güven şeridi testi (hero DIŞINDA, `stage-top`'tan sonra; 4 öğe; N5 kaynak bağı **yeni**);
  yeni Otopilot sahnesi testi (parçalar + vaat cümlesi kayıttan); kayan şerit yokluğu; sorun–çözüm 4. madde Otopilot +
  güvenlik metninin kartta YOKLUĞU (**yeni**); sahne listeleri (`marquee`, `secret-encryption`, `tenant-isolation` çıktı, `tile` 5→3);
  taslak notu: görünür ziyaretçi metni + iç kayıt öznitelikte birebir.
- `agent-claims.test.ts`: yeni vaat `hero-moment` ve `homeAgentGain` katı tarama kümesine EKLENDİ (daha geniş tarama);
  `ProblemSolution.astro` izinli içe aktaranlara ve SAFE-ad denetimine eklendi; anasayfada yeni metinlerin görünmesi doğrulanır.
- `scenes.test.ts`: `marquee` ve iki güvenlik sahnesi kaldırıldı; `loop-marquee` döngüsünün YOKLUĞU.
- `home-demos.test.ts`: bento için "döngü yok" (N9), ekosistem için "yörünge dönmez, akış paketleri sürer", sipariş hikâyesi kart tonu.
- e2e: `home-premium` şerit testleri → güven şeridi; `home.spec` taslak notu (ziyaretçi metni + iç kayıt) + plan başına Otopilot bloğu; reduced-motion sahne listesi.

## Test sonuçları

- `vitest run` (s27b birleşik): **801 geçti, 2 başarısız** — ikisi de bulut kopyasında olmayan kök `INTEGRATIONS_REGISTRY.md`
  yüzünden (`claims.test.ts`; taban `origin/main`'de de aynı 2 hata).
- `astro build`: 49 sayfa, hatasız.
- Playwright (`--update-snapshots=missing`, 3 viewport, axe dahil): ilk koşu eksik Linux tabanlarını yazdı + 2 gerçek hata
  (taslak notu metni, taşınan sahneler) → düzeltildi; son koşu **449 geçti, 46 atlandı, 0 başarısız**. `*-linux.png` commit'lenmedi.
- Lighthouse (mobil, 3 koşu medyanı): taslak 98 / 100 / 100; yayın 98 / 100 / 100 / SEO 100; CLS 0. Tüm eşikler sağlandı.
- Bulut notu: Playwright 1.63'ün Chromium'u indirilemiyor (ağ politikası) → `/opt/pw-browsers/chromium-1194` commit'lenmeyen
  config sarmalayıcısıyla; Lighthouse root altında `--no-sandbox` kopyasıyla. `frontend` bağımlılıkları kurulum betiğinde Playwright
  indirmesi başarısız olduğu için atlanmıştı → token derlemesi için elle kuruldu (aşağıda rapor).
