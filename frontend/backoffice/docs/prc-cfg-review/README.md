# PRC-CFG inceleme: Backoffice "Rekabet ayarları"

Dal `cloud/prc-r1`. Ekran: **Sistem ayarları → Rekabet ayarları** (`/sistem/rekabet`). Backend'e dokunulmadı; yeni yönetim ucu yok (ADR-0031 Karar 5).

## Ne yapıldı (Durum → Karar → Eylem → Ayrıntı, K51)
- **Durum:** özellik (`features.competition`, pilot listesi), Trendyol çağrı bütçesi, bildirim gölge modu, istisna sayısı. Dikkat uyarıları: bayrak açık + bütçe < 20 ya da > 300 istek/dk; bayrak açık + gölge mod >= 14 gündür açık (açılış zamanı yayın geçmişinden); bayrak kapalı + istisna var (bilgi). "Alanlar Trendyol'da yerelde doğrulanana kadar özellik kapalı tutulur" notu sabit.
- **Karar/Eylem:** plan tablosu (SKU tavanı, tazeleme dk + "günde N", tazelik eşiği, öncelik) + bütçe + gölge mod, mevcut `IntegrationConfigService` taslak → önizleme → gerekçeli yayın (step-up dahil) → geçmişten geri alma. Alan hataları (istemci erken denetimi + sunucu `fields`) hücrede/listede; geçersizken kayıt kapalı. "~15 sn, yeniden başlatma yok" bilgisi görünür.
- **Müşteri istisnaları:** `getCompetitionSettings.overrides[]` tablosu (müşteri, plan, istisna alanları, etkin değerler — kalın = istisna, not, güncelleme). "İstisna ekle/düzenle" diyaloğu: numara → `getTenantCompetition` (plan değeri / etkin / kaynak) → alanlar (boş = plan değeri, sınırlar `limits`'ten) → not → gerekçe ≥10 → "İstisnayı kaldır" (`override:null`). Kayıttan sonra önce/sonra özeti.
- **Ayrıntı:** mevcut `HistoryPanel` (`_platform` geçmişi) + denetim notu (`subscription.competition_override`, `backoffice.write`).
- **Bağlantı:** Abonelik detayı → "Rekabet izleme ayarı ve istisnası" → `/sistem/rekabet?tid=N` (diyalog o müşteriyle açılır, sorgu tüketilir).

## Kararlar
- `platform.pricing` grubu genel Platform ayarları panelinde zaten listelenmiyordu (panel sabit grup listesi kullanır); statik test bunu korur. `features.competition` bayrağı genel bayrak panelinde de görünür (bayrak orada kalır); bu ekran yalnız durumunu gösterir ve oraya bağlantı verir (çift düzenleme yüzeyi açılmadı).
- `setCompetitionOverride` backend `REAUTH_RPCS`'te yok → step-up istenmez, yalnız gerekçe (`REAUTH_OPS` değişmedi; test backend ile uyumu korur). Plan/bütçe yayını step-up ister (mevcut akış).
- Bir kaynağın hatası ötekini düşürmez: istisna listesi okunamazsa plan/durum çalışır, istisna bölümü hata + "Tekrar dene" gösterir.
- Sahte API: `platformCatalog()` artık backend gibi 14 `platform.pricing` anahtarı + `features.competition(.tenants)` içerir (eski "bayrak yok" varsayımı güncellendi). Kurgu kolu: `__boMock.seedCompetitionPilot()`.

## Testler
`npx vitest run` 131/131 (yeni `tests/competition.test.ts`: istisna formu, plan tablosu taslağı, dikkat uyarıları, uç sözleşmesi, ekran durumları). `p2-states` testindeki önceden var olan bayat beklenti (`retryJobs`) düzeltildi. e2e `competition.spec.ts` (7 test × masaüstü/koyu/mobil, axe WCAG 2.1 AA 0 ihlal) ve `settings-admins.spec.ts` geçti. `npm run build` temiz.

## Ekran görüntüleri (`BO_REVIEW=1`, açık/koyu 1440, 820, 390)
`10-genel-kapali` varsayılan · `11-pilot-dikkat` açık pilot + uyarılar · `12-plan-gecersiz-deger` · `13-yayin-diyalogu` · `20-istisna-diyalogu` · `21-istisna-sonuc` (önce/sonra) · `14-istisna-bos` · `30-hata-istisna-listesi` · `40-abonelik-detay-baglanti`.

## Bilinen sınırlar
- İstisna listesi en çok 200 satır (sunucu sınırı); sayfalama/arama yok.
- Gölge mod süresi yayın geçmişinin son 20 sürümünden hesaplanır; bayrak daha eskiden açıldıysa uyarı çıkmaz.
- Uyarı eşikleri (20 / 300 / 14 gün) sezgiseldir; gerçek Trendyol tüketimi ölçülünce gözden geçirilmeli.
- Görsel tabanlar yerelde (Windows) onaylanır; `review-p2`/`review-elev` kareleri (`/sistem/bayraklar`) yeni bayrak nedeniyle değişir.
- `vue-tsc` bu ortamda 1.8 + TS 5.9 uyumsuz; tip denetimi vue-tsc 2 ile yapıldı (yalnız önceden var olan Vuetify `TS7006` gürültüsü kalır). Rollup yerel ikilisi `--no-save` kuruldu.
