# DS-v2 Aşama 3 — premium eleştiri turu 1

Kaynak: `e2e/specs/a3-review.spec.ts` (A3_REVIEW=1) ile `screens.ts`'teki 32 ekran + 5 kimliksiz ekran, 1440×900 ve 390×844,
mock fixture'larla (Linux Chromium; görsel onay yerelde). Ölçüt: kullanıcı brifinin 10 maddesi (`docs/design-reference/README.md`).
Durum: **D** = bu turda düzeltildi · **T2** = tur 2'ye kaldı · **A** = açık (gerekçeli).

## Kabuk (tüm ekranlar)

| # | Kusur | Madde | Durum |
|---|---|---|---|
| K1 | Sol menüde ham i18n anahtarları (`menu.user.user`, `menu.account`, `MENU.INTEGRATIONS`) — i18n'de olmayan düğüm anahtarı ekrana düşüyordu | 2 | D — `navigation/menuTitle.ts` tek çözümleyici (menü anahtarı → üst/başlık varyantı → `screens.ts` titleKey → okunur yedek); `menu.user.*`, `menu.account`, `shell.section.settings/account` eklendi; birim testi |
| K2 | Aynı kök sorun sekme şeridi başlığında | 4 | D — `ShellTabStrip` aynı çözümleyiciyi kullanır |
| K3 | "Ayarlar" / "Hesabım" bölümleri tanımsız → "Diğer"e düşüyordu | 2 | D — `sections.ts` |
| K4 | İkonu olmayan menü öğelerinde küçük nokta yedeği | 2 | A — gerçek `MenuService` ağacı ikon taşır; nokta yalnız ikonsuz kayıtta (tutarlı yedek) |

## Liste ekranları (Sipariş, İade, Müşteri, Fatura, Mesaj, Ürün, Loglar, Finans, Destek, Admin listeleri)

| # | Kusur | Madde | Durum |
|---|---|---|---|
| L1 | Sayfa boyutu seçicide anlamsız değerler (13, 15, 20) | 6 | D — tek standart 10/25/50/100, varsayılan 25; statik test (`tests/page-size-standard.test.ts`) |
| L2 | Geniş tabloda son kolon eylem kolonunun altında **kesik** görünüyor (İşlem kayıtları "Bitiş": `22.09.202`, `Devam edi`), kaydırılabildiği anlaşılmıyor | 6 | D — `EkDataGrid`: seçim + ilk (kimlik) kolonu sola yapışık (kap ≥600px), kaydırılan içerik varken yapışık kenarlara `shadow-scroll-start/end` |
| L3 | Liste başlığı ile diğer sayfa başlıkları farklı ritimde (listelerde bölüm yolu yok, açıklama 12px sıkışık) | 10 | D — `EkListScreen` `section` (breadcrumb) + açıklama `body`; `EkPageHeader` tip rollerine bağlandı |
| L4 | Finans özet şeridi: dar ekranda yatay taşma ("İşlem 321" kesik), Komisyon **kırmızı** (gider bir hata değil — renk anlamı), serbest etiket stili | 1, 6 | D — KPI ızgarası (mikro etiket + kalın değer, sarar), komisyon nötr |
| L5 | Finans: tarih saniyeli (`28.09.2026 10:00:00`), kimlikte "ID:" gürültüsü, tür çipleri BÜYÜK HARF (diğer çiplerle tutarsız) | 6 | D |
| L6 | Destek yönetimi: öncelik/tür ham İngilizce kod (`HIGH`, `TECHNICAL`) | 6 | D — `TICKET_*_LABELS` |
| L7 | Destek yönetimi: "DESTEK MERKEZİ ANALİZİ" dekoratif bant `warning` tonunda (dikkat anlamı yok) | 1 | D — kaldırıldı (açıklama başlıkta) |
| L8 | Ürün listesi inceleme görüntüsü boş (asenkron içerik yakalanmadan çekim) | — | D — araç: içerik (h1/tablo/kart) bekleniyor |
| L9 | Müşteri telefonu biçimsiz (`5551112233`) | 6 | T2 |

## Formlar ve sekmeler

| # | Kusur | Madde | Durum |
|---|---|---|---|
| F1 | Ekran içi sekmeler (Finans, İşlem kayıtları, entegrasyon formları, müşteri kartı) Vuetify BÜYÜK HARF + geniş harf aralığı — DS sekme dili değil | 4, 9 | D — global `.v-tab` cümle düzeni + `tab` rolü |
| F2 | Alan yardım/hata metni 12px, geniş harf aralığı, sıkışık satır (Stok politikası "Birincil kanalda tampon adet uygulanmaz.") | 9 | D — `caption` rolü (12/16, düz aralık), üst boşluk 4px |
| F3 | Stok politikası: "Birincil satış kanalı" seçim alanı ~88px yüksekliğe uzuyor | 9 | D — `EkSettingsSection` alanları `flex: 0 0 auto` |
| F4 | Kayıt formu: İsim/Soyisim/E-posta/Şifre satırları arasında boşluk yok, alanlar birbirine yapışık (brif m.9 "iç içe giren alanlar") | 9 | D — `EkFormGrid` |
| F5 | Giriş sekmeleri 11px BÜYÜK HARF; etiket "EPosta"; kayıt metin bağlantıları tarayıcı mavisi; başlık sekmeler arasında zıplıyor (sabit 372/576px pencere + dikey ortalama) | 9, 10 | D — cümle düzeni, `E-posta`, `action` rengi, form üste yaslı + içerik kendi yüksekliğinde |
| F6 | Platform işareti (`T`, `H` …) solda 3px marka çizgisiyle "( T" gibi kırık görünüyor | 1 | D — ikon kapsülü motifi (marka tonlu zemin + ince halka) |

## Diğer ekranlar

| # | Kusur | Madde | Durum |
|---|---|---|---|
| E1 | Abonelik: "Bu Plana Geç" düğmesi kısa kartta ~80px'e uzuyor | 10 | D — `v-btn--block` flex büyümesi kapatıldı |
| E2 | Abonelik metinlerinde "--" (çift tire) | — | D (ana durum metinleri) · T2 (kalanlar) |
| E3 | Sistem yönetimi: bölüm başlıkları 11px BÜYÜK HARF, kart başlıkları BÜYÜK HARF — hiyerarşi ters; "FİLTRE:" etiketi | 5, 10 | D — heading/subheading/micro rollerine bağlandı |
| E4 | Sistem yönetimi: metrik "hap"ları renkli sayı + çerçeve (EkMetricCard dilinde değil) | 5 | T2 |
| E5 | Kargo/E-fatura entegrasyon: boş durum ikonu büyük ve gri, "Başlamak İçin Seçim Yapın" Başlık Düzeni | 10 | T2 |
| E6 | Entegrasyon ayarları, motor ayarları, etkin yapılandırma, uyum konsolu | — | T2 (bu turda görüntü alınamadı → araç düzeltildi) |

## Renk envanteri (brif m.1)

Kalan literal ölçümü (tur 1 sonu, `scripts/style-literal-counts.js`): hex 298 · rgb 94 · inline `style=` 226 (67 dosya; 212'si
`public/assets/css/site.css` + `integrations.css`). Temizlik üç paralel işte yürütülüyor (tur 2).
