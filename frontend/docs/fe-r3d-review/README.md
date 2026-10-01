# fe-r3d — FR3 madde 17–18 (onaylı öneriler + uygulama kimliği denetimi)

Kaynak: `docs/cloud-contracts/FE_FEEDBACK_R3_2026-10-01.md` madde 17–18, USER_DECISIONS K48/K49. Dal `cloud/fe-r3d`
(taban `origin/main` + `cloud/fe-r3a` → `r3b` → `r3c` birleşik). İş iki oturumda yapıldı; ilk oturumun devir notu
`HANDOFF.md`. Kimlik belgesi: `frontend/docs/APP_IDENTITY.md`. Öneriler/kararlar: `frontend/docs/PROPOSALS_PENDING.md`.

Görüntüler `sonra/` (bu dal, 1440 + 390, light + dark; 13 ekran + giriş) — `sonra/axe/*.json` her karenin WCAG 2.1 AA
sonucu + makine bulguları (yatay taşma, ham i18n anahtarı, "undefined/NaN"). Üretim:

```
POLISH_REVIEW=1 POLISH_WIDTH=1440|390 POLISH_OUT=docs/fe-r3d-review/sonra POLISH_ONLY=dashboard,orders,... \
  npx playwright test e2e/specs/fe-polish-review.spec.ts -c playwright.cloud.config.ts --project=chromium-desktop
```

## 1. Yapılanlar — madde 17 (PROPOSALS_PENDING onaylandı)

| Madde | Uygulama | Commit |
|---|---|---|
| P01 + P08 | Tek para biçimi `₺1.048,80`; plan tavan değerleri "Sınırsız" | `19705fa8` |
| P02 + P10 | Filtrelerde "Tümü" kalktı (boş = tümü); Mesajlar'da Kanal ilk | `30711b98` |
| P07 + P13 | Tek terim "Parola"; girişte tek sıfırlama noktası (iki sekme) | `e453c483` |
| P05 + P06 + P11 | Tek ad kaydı (menü/sekme = başlık kökü); "Destek talepleri" + "Yeni talep"; Ayarlar bölümü (FE eşlemesi) | `db65f7d1` |
| P12 | E-fatura kısa/uzun adları (TEF, TCL, ELG, GİB; renk nötr) | `3edac58e` |
| P16 | Aynı kökten 4 sn içindeki beklenmeyen hatalar tek bildirim + tek Destek kodu | `d05584a7` |
| P14 + P15 | Tur kartı açık katmanda gizli / çubuğun üstünde; liste kartı asgari 340px, ekran kendi içinde kayar | `3377f130`, `5a0e13b1` |
| P03 | Finans ve İşlem kayıtlarında etkin sekmenin arama + yenile'si başlık çubuğunda (`EkPageHeader tools-id` + `EkListScreen tools-target`, Teleport; `listTools.ts`) | `9b31dabe` |
| P04 | 1440'ta yatay kayma yok: tarih yalnız gün (saat ipucunda), Müşterilerde "İletişim" kolonu; "Kurumsal" rozeti kırpılmıyor | `9fe84410` |
| P09 | Denetim günlüğü: neden kodu okunur karşılık (ham kod ayrıntıda), "Silinmiş / Bilinmeyen kullanıcı" | `40facc8b` |
| P-MCP-1 | Öneri = sözleşme adları korunur (değişiklik yok) | — |
| P-MCP-2 | Onay kartı gövdesi tek bileşen `@entegrasyonik/chat/confirm` (`ConfirmBody`) — sohbet ve MCP onayı | `1e8f4c97` |
| Kapanış | Her madde "KARAR: uygulandı" + sapma; backend istekleri B-R3D-1…5 | `4c2c1051` |

Ölçüm (P04, 1440×900, menü açık): tablo taşması Siparişler +29px, İadeler +41px, Müşteriler +62px → 0.
Ölçüm (P15, 1280×640): Denetim günlüğü kartı 340px'e korunur, ekran kökü kayar (sayfalama erişilebilir).

## 2. Kararlar (eleştiri → alternatif → seçim)

1. **P03 nasıl taşınır?** (a) Her sekmenin arama modelini sayfaya yükseltmek (sekme bileşenleri değişir, durum iki yerde),
   (b) FR2_PATTERNS'a istisna (onaylanan öneri değil), (c) **Teleport**: sekmenin kendi araç satırı başlıktaki yuvaya
   taşınır, durum sekmede kalır. **Seçim (c)** — sözleşme ve sekme bileşenleri değişmez; `v-show` ile gizlenen İşlemler
   sekmesi `tools-target=false` ile yuvayı bırakır, KeepAlive sekmeleri `onDeactivated` ile bırakır (iki sekmenin aracı
   üst üste binmez; e2e ile doğrulandı).
2. **P04 kapsamı.** Önerinin "İçerik + Stok birleşir" kısmı ölçümle gereksiz çıktı (tarih kısalınca sığdı) → uygulanmadı;
   veri düzeni gereğinden fazla değişmedi.
3. **P09 "Silinmiş" iddiası.** Dizin eksik/hatalıyken her bilinmeyen kimliğe "Silinmiş" demek yanlış olur → yalnız dizin
   eksiksizse (toplam ≤ dönen) "Silinmiş kullanıcı", aksi hâlde "Bilinmeyen kullanıcı". Neden metinleri uydurulmadı:
   backend'in AuditLogger çağrılarındaki 9 kodun tamamı tarandı; kayıtta olmayan kod ham kalır.
4. **P-MCP-2 sınırı.** Başlık ve eylemler yüzeyde kaldı (sohbet kartı başlığa odak + geri sayım, MCP sayfası ayrı sözleşme);
   ortaklaşan yalnız gövde. Ayrı giriş noktası (`/confirm`) — MCP onay sayfası sohbetin markdown/protokol kodunu çekmez.
   Dış sistem notu tek tonda (bilgi; MCP sözleşmesi ton belirtmiyordu).
5. **P15 (ilk oturumla çakışma).** İki oturum P15'i paralel yaptı; ilk oturumun çözümü (340px, `EkListScreen` içinde
   kayma) korundu, bu oturumunki atıldı. Ölçüm, `EkListFrame`'i doğrudan kullanan Denetim günlüğü ve Finans'ta kartın
   hâlâ kırpıldığını gösterdi → yalnız o iki kök tamamlandı (`5a0e13b1`).

## 3. Madde 18 — uygulama kimliği denetimi

`APP_IDENTITY.md` §10 kontrol listesiyle 43 ekran × light/dark × 1440/390 (172 kare) tarandı; makine bulguları:
**axe 0 ihlal, yatay taşma 0, bozuk metin 0** (ham anahtar yalnız bilinçli ikincil satırlar: denetim olay kodu,
yönetim yapılandırma anahtarları). Görsel inceleme üç bağımsız gözden geçirmeyle yapıldı.

**Bariz olarak uygulananlar** (`aa87c860`, kimlik metin commit'i ve sonraki bariz düzeltmeler commit'i):
- Cümle düzeni (§8): durum etiketleri ("Sipariş onaylandı", "Satıcı onayı bekliyor", "Teslim edildi", "Cevap bekleniyor",
  "Ürün sorusu", "Hata oluştu" …), menü ("Ürün kataloğu", "Stok sağlığı", "Stok politikası"), üst arama ("Akıllı arama"),
  yönetim başlıkları ("Mağaza yönetimi", "Sistem yönetimi", "Destek yönetimi", "Motor ayarları", "Entegrasyon uyumu"),
  arama ipuçları, mağaza ayarları alanları ("&" → "ve"), "Ayarları kaydet", "Bu plana geç", "Abonelik ve planlar".
- "Platform" kanal anlamında kalktı (§8): "Kanal onayı bekliyor", Finans filtresi "Kanal", toplu işlemler "Kanallara yükle /
  Kanallarda güncelle", Hızlı başlangıç "Kanalı seçin", Müşteriler "Kaynak" → "Kanal", "Kanal müşteri no".
- Teknik ayrıntı / iç not kalktı: giriş kabuğu güven maddeleri sitenin fayda diliyle ("AES-256-GCM", "ayrı veritabanı"
  yok — K44/K45), veri dışa aktarımında "NDJSON", yönetim listesinde geliştirici notu, boş durumda ADR referansı,
  "probe" → "kontrol", "tenant/chunk" açıklamaları, "İhracat döngü gecikmesi" → "Gönderim döngüsü gecikmesi", "External ID".
- Terimler: "Bilet" → "Destek talebi", "statü" → "durum", "Dükkan" → "Mağaza", "Ret durumu", "İşlem türü",
  plan özelliği "Yapay zekâ bağlantısı".
- Tutarlılık: Çıktılar breadcrumb'ı "Ayarlar" (P11 sonrası menüyle aynı), Finans net etkide eksi işareti tabloyla tek (`−`).
- `APP_IDENTITY.md` §5 düzeltildi: içerik sekmeleri r3a kararıyla (segment tepsisi), "alt çizgi" ifadesi yanlıştı.

**Onaya bırakılanlar** (akış/davranış/ortak bileşen — K48): PROPOSALS_PENDING **P-R3D-1…14** — finans detayı ortak kayıt
detayı desenine, satır eylemleri tek desen, tek birincil eylem ("Sorgula" ikincil), tarihte saat ipucu (diğer listeler),
dekoratif ikon karoları nötr, 390 kart modunda başlık satırı, entegrasyon sağlığı ham kodları, entegrasyon form alan
adları, abonelik plan düğmeleri, kabuk "—" tutamağı, pasif sekme solması, yardım hero gradyanı, Otopilot boş durumu,
yönetim ekranları (backoffice turu).

**Denetimde incelenemeyenler:** `account-connected-apps`, `settings-ai-connection`, `settings-notifications` inceleme
fixture'ının menüsünde yok (Anasayfa'ya yönleniyor) — ekran hatası değil, fixture kapsamı; `urun-yeni` karesi liste
gösteriyor (form rotası incelemede açılmıyor). Sonraki turda fixture menüsüne eklenmeli.

## 4. Testler (bulut, chromium, son koşu)

| Kontrol | Sonuç |
|---|---|
| vitest (tam) | 83 dosya, **1588/1588** |
| vue-tsc | 0 hata (typecheck mandalı OK) |
| `npm run build` / `build:backoffice` | OK / OK |
| `test:chat` | 183 geçti, 1 atlandı |
| `test:backoffice` | 101/102 — 1 kırık `p2-states` REAUTH (backend `retryJobs` ekledi; `origin/main`'de de aynı, bu dalla ilgisiz) |
| Stil / desen / no-console / sözleşme yolu mandalları | OK (desen tabanı güncellendi: 14 → 13) |
| Playwright (ilgili spec'ler, `--update-snapshots=missing`) | error-reporting, financial (+P03 testi), logs, audit-log (+P09 iddiaları), orders, claims, customers, mcp-approval, mcp-fe-review, admin-* , metin değişikliğinden etkilenen 28 spec: işlevsel hepsi geçti. İlk koşuda "snapshot yok" hataları = bulutta `-linux.png` tabanının yazılması (ikinci koşu geçer); yük altında (4 işçi + paralel denetim) 3 menü-gezinme zaman aşımı tek başına koşuda geçti |
| fe-polish denetimi (43 ekran × 2 tema × 2 genişlik) | axe 0, taşma 0 |

Görsel tabanlar: metin/kolon değişiklikleri Windows tabanlarını (`*-win32.png`) etkiler — yerelde
`--update-snapshots` ile yenilenip görsel onay verilmeli (orders, claims, customers, invoices, messages, finance, logs,
products, subscription, settings, integrations-*, admin-*, mcp-approval, dashboard).
