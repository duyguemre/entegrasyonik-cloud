# BO-R1a — yönlendiren genel bakış + "Durum → Karar → Eylem → Ayrıntı" deseni

Dal: `cloud/bo-r1a` (taban `origin/main`, sözleşme gelince yeniden birleştirildi). Tarih: 2026-10-01.
Kaynak: `docs/cloud-contracts/BO_FEEDBACK_R1_2026-10-01.md` (BO1-DASH 1-5, BO1-PAGES 6-7), K51; K10/K18/K48 çerçevesi.
Sözleşme: `docs/cloud-contracts/API_BACKOFFICE_ATTENTION.md` (2. kontrolde origin/main'e geldi; öneri belgesi bu yüzden
yazılmadı, ilk öneri şekli commit `faz3-bo-r1a-cloud: Durum→Karar→…` geçmişinde duruyor).

## Kareler (1440 + 390 × açık/koyu)
| Önek | Ne |
|---|---|
| `once-*` | origin/main genel bakışı (BO-ELEV karar şeridi + 6 KPI + paneller) — aynı sahte veriyle |
| `it1-02-*`, `it2-02-*` | ara iterasyonlar (yalnız tam sayfa açık tema) |
| `sonra-01/02` | **sorun var**: ilk ekran / tam sayfa |
| `sonra-03` | teknik ayrıntılar açık |
| `sonra-11/12` | **her şey yolunda** (`__boMock.setCalm(true)`): ilk ekran / tam sayfa |
Betik: `e2e/specs/review-r1a.spec.ts` (`BO_REVIEW=1 BO_REVIEW_PREFIX=sonra`). Görsel taban DEĞİLDİR.

## Kararlar
1. **Pano dört soruyu sırayla yanıtlar** (`BoTriageSection`, başlık = soru, yanında kısa cevap rozeti "Evet · 1 kritik ·
   3 uyarı" / "Hayır"): 1 sistemde müdahale · 2 büyük resim · 3 müşterilerde müdahale · 4 genel kullanım. Altı KPI kartı,
   sorun grupları kartı ve teknik paneller ilk ekrandan kalktı; teknik paneller **katlanır Ayrıntı**'ya taşındı
   (`?ayrinti=teknik`, açılınca yüklenir — ilk ekranda tek iki çağrı: getAttention + getPulse).
2. **Durum başlığı** (`BoStatusHeader`): tek cümle hüküm ("3 konu şimdi müdahale istiyor; 5 konu izlenmeli" / "Her şey
   yolunda"), sağlık rozeti, bölümlere atlayan iki özet ("Sistem 1 kritik · 3 uyarı"), **önerilen ilk adım**
   (`BoActionCard`). İlk adım seçimi: en yüksek önem; eşitse **sistem** öğesi önce (çok müşteriyi etkiler).
3. **Sakin yüzey:** sorun varken bile zemin boyanmaz; ton sol çizgi, ikon ve rozette. Dolgu düğme yalnız kritik maddelerde
   ve önerilen ilk adımda. Önem: ikon biçimi + renkli sözcük ("Kritik"/"Uyarı"), ayrı rozet yok (gürültü).
4. **Sunucu metni korunur** (title/why/impact/eylem etiketi), sıra sunucunundur; önyüz yalnız kontrol kimliğine göre bir
   satırlık **"Ne yapmalı"** ipucu ekler (sözleşmede alan yok — aşağıda U1).
5. **Tek tıkla eylem:** sözleşme hedefi ekranların okuduğu sorgu adlarına çevrilir (U2). Tek müşterili müşteri öğesi
   liste yerine **o müşterinin kaydını** açar (U3).
6. **"Her şey yolunda"** iki listede de neyin denetlendiğini söyler ("Denetlenen: Kuyruklar · Devre kesiciler · …"); okunamayan
   kontrol varken hüküm asla "Her şey yolunda" olmaz (rozet "Kısmi bozulma", liste üstünde "X okunamadı — liste eksik olabilir").
7. **Uç yoksa** (eski backend, 404): sistem maddeleri `getHealth`'ten türetilir, müşteri bölümü "henüz bağlı değil" der —
   uydurma veri yok.
8. **Mobil:** listeler 2 maddeyle açılır (kritikler her zaman görünür), soru başlıkları gövde puntosunda; 390'da sayfa
   ~4.000 → ~3.100 px.
9. Bileşenler `src/components/triage/` (backoffice'e özgü, ortak pakete dokunulmadı). Desen: `BO_UI_PATTERNS.md` §11
   (ilk sürüm erken push edildi; bo-r1b için kontrol listesi + sorgu çeviri tablosu §11.6).

## İterasyonlar (önce/sonra + sert eleştiri)
| # | Eleştiri | Yapılan |
|---|---|---|
| 0 → 1 | Eski pano bir **bilgi yığını**: şerit + 6 KPI + 4 panel; "ne yapmalıyım" yok, müşteri sorunları hiç yok. | Dört soru düzeni, dikkat listeleri, durum başlığı, katlanır ayrıntı. |
| 1 | 1440'ta 1-2 aynı satırı paylaşıyor → kısa kartın altında ~400 px boşluk. 390'da hüküm rozetle sıkışıp 5 satıra kırılıyor. Kırmızı zemin bağırıyor. İlk adım tek müşterili kuruluma gidiyor, N11 devre kesici (çok müşteri) geride. Her maddede rozet + ikon tekrarı. Sayfa açıklaması eski. | Duvar düzeni (DOM sırası korunarak `grid-template-areas`), mobil hüküm tam satır, sakin yüzey, ilk adımda sistem önceliği, önem rozeti → ikon + sözcük, yeni `lede`. |
| 2 (sözleşme geldi) | Önerimden farklı: sunucu metni, `groups`, `actions[]`, `subjects[]`, nabız tamamen başka (aralık yok, sipariş hesaplanamaz, p95 yok). | Tipler/adaptör/sahte API birebir; 7 gün seçimi kaldırıldı ("son 24 saat, 7 gün ortalamasına göre"); kanal dağılımı kalktı (sözleşmede yok). |
| 2 | "bekletiliyor.N11" (why/impact boşluğu); "Kritik 3" birimsiz sayı belirsiz; nabız etiketleri "(24 sa)" ile kırılıyor; 390'da sayfa 4.000 px. | Boşluk düzeltildi, birimsiz sayı gizlenir, etiketler kısaldı, mobil limit 2. |
| 3 | 390'da soru başlığı cevap rozetiyle **üst üste biniyor** (gerçek hata). Nabız "henüz ölçülmüyor" satırıyla açılıyor. Sakin senaryoda 1'in altında hâlâ boşluk. | Soru tam satır; ölçülemeyen satırlar sona; satır şablonu `auto auto 1fr` (boşluk ~380 → ~230 px). |
| Kalan | Sakin senaryoda 2. bölüm 1.'den uzun olduğu için ~230 px boşluk kalıyor (DOM sırası 1-2-3-4 korunurken CSS ile giderilemez; masonry yok). Önerilen ilk adım listedeki ilk maddeyi tekrar ediyor (bilinçli: "buradan başla"). Sunucu etiketi "Ödeme sorunlu aboneliklere git" tek müşteride detaya gidiyor (U3). | Rapor; bo-r1b/backend kararı. |

## Testler
| Koşu | Sonuç |
|---|---|
| `npm run test:backoffice` (backoffice + ui) | 115 + 25 geçti (yeni `tests/attention.test.ts` 13 test: sözleşme şekli, strict/limit, sıra, susturulmuş/gölge uyarı yok, sakin/degraded/Redis kolları, sorgu çevirisi, tek müşteri → detay, 404 geri düşüşü, nabız) |
| `npm run build:backoffice`, `vue-tsc` (backoffice) | temiz |
| frontend `vitest run` | 76 dosya, 1530 test geçti |
| frontend `npm run build` | temiz (mevcut parça boyutu uyarısı) |
| e2e `r1a.spec.ts` + `elev.spec.ts` + `smoke.spec.ts` × masaüstü açık/koyu + mobil, `--update-snapshots=missing` | 82 geçti, 29 atlandı (mevcut proje atlamaları); axe 0 ihlal (açık/koyu, sorun var + her şey yolunda) |
Not: `p2-states.test.ts` origin/main birleşmesinden sonra kırmızıydı (backend `retryJobs` BE-03 eklendi, önyüzde kullanılmıyor) —
"bilinçli kullanılmayan" listesine gerekçesiyle eklendi. Bulutta `@rollup/rollup-linux-x64-gnu` `--no-save` kuruldu
ve `npm run tokens` çalıştırıldı (ortam; commit yok). İlk e2e koşusundaki zaman aşımları 3 işçili paralel yükten; 2 işçiyle temiz.

## Sözleşme uyumsuzlukları / öneriler (backend + bo-r1b)
- **U1 `advice` alanı yok.** "Ne yapmalıyım" sorusu için sunucu yalnız eylem etiketi veriyor. Önyüz kontrol kimliğine göre
  ipucu ekliyor (`ADVICE`, `src/api/attention.ts`). Öneri: `AttentionItem.advice: string | null` (≤ 160) — gelince önyüz onu kullanır.
- **U2 Sorgu adları ekranlarla uyuşmuyor.** Sözleşme `tab`/`source` ve İngilizce değerler (`failed`, `resilience`,
  `api-health`, `slow-queries`) kullanıyor; ekranlar `sekme`/`kaynak` + Türkçe değerler okuyor. Adaptör çeviriyor (tablo:
  `BO_UI_PATTERNS.md` §11.6). Öneri: sözleşme notuna "FE yolları `screens.ts` sorgu adlarıyla" eklensin ya da çeviri kalıcı kabul edilsin.
- **U3 Liste hedefleri süzgeci henüz okumuyor:** `/abonelikler?status=`, `/musteriler?hasIssues=1`, `/bildirimler/uyarilar?status=&ruleId=`,
  `/entegrasyonlar?integrationCode=`, `/loglar?status=`. Planlı ekranlar (`/musteriler/yasam-dongusu`, `/musteriler/destek`)
  "yakında". Önyüz tek müşterili öğede detaya yönlendiriyor; çok müşterili öğe sözleşme hedefini korur → **bo-r1b bu
  süzgeçleri okumalı** (BE-01 `listTenants` dahil).
- **U4 `kind:'action'` (yetenek) akışı panoda yok.** `platform.engine.retry_jobs` vb. "kilit ikonlu ipucu" olarak gösteriliyor;
  toplu yeniden deneme diyaloğu başarısız işler ekranında (bo-r1b / NT) yapılmalı.
- **U5 getPulse'ta karşılaştırma tabanı sınırlı:** `previous24h` yalnız siparişte; HTTP/kanal için 7 g / 7 kullanıldı
  ("7 gün ortalamasına göre"). Sipariş sayacı yok (`computable:false`) → "Henüz ölçülmüyor". Öneri: `calls.http.previous24h`.
- **U6** `getPulse` p95 ve kanal başına bağlı müşteri dağılımı içermiyor; önerimdeki bu iki gösterge kaldırıldı.
- **U7** `summary` sayıları grup ayrımı yapmıyor; önyüz grup sayımını `items` üzerinden yapıyor — `truncated:true` iken grup
  sayımı eksik kalabilir (önyüz "Toplam N" notunu `total`'dan gösterir). Öneri: `groups.*.summary`.

## Commit'ler
`faz3-bo-r1a-cloud:` önekli — desen + bileşenler (erken), pano + sözleşme adaptörü + sahte API, iterasyon 2 + e2e,
iterasyon 3 + belgeler + kareler. `git log origin/main..cloud/bo-r1a`.
