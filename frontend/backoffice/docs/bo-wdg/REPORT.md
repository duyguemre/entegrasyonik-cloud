# BO-WDG raporu — backoffice web arayüz kuralları denetimi (K60)

Dal: `cloud/bo-wdg` ← `origin/cloud/bo-r2b` (`f40544b7`, R2B raporu tamam) + `origin/main` (`199628a5`). Kural seti:
`.claude/skills/web-design-guidelines/guidelines.md` (yerel kopya) + SKILL.md proje uyarlaması; `premium-ui-standards`,
`BO_UI_PATTERNS.md` (§6, §8, §12) önceliklidir. Ayrıntılı bulgu listesi (`dosya:satır - bulgu → karar`): `AUDIT.md`.
Kalıcı desen: `BO_UI_PATTERNS.md` §13 (yeni ekranlar için). Kapsam: `frontend/backoffice` + `packages/ui` (yalnız ortak, web'i
değiştirmeyen kurallar) + `packages/chat` (isteğe bağlı prop; varsayılan davranış aynı).

## 1. Sayılar (kritiklik sınıfına göre)

| Sınıf | Bulgu | Uygulandı | Atlandı | Zaten karşılanıyor |
|---|---:|---:|---:|---:|
| KRİTİK | 10 | 10 | 0 | 0 |
| YÜKSEK | 31 | 30 | 1 | 0 |
| ORTA | 43 | 31 | 11 | 1 |
| DÜŞÜK | 36 | 13 | 23 | 0 |
| ATLANDI (overengineering / kapsam dışı) | 8 grup | — | 8 | — |

Not: bir satır birden çok yeri kapsayabilir (ör. "Etkilenen" satırı 9 diyalog, sayı biçimi 9 dosya). Bulguların 3'ü testte
ortaya çıktı: `main` eşitlemesinin ortak bileşen değişiklikleri (menü etiketi kontrastı, 28 px Yenile) ve bo-r2b'nin son
commit'indeki tür hatası (AUDIT.md "Test sırasında bulunanlar").

## 2. Uygulananlar (sayfa / katman başına)

**Ortak katman (tüm sayfalar)**
- Tek `<main>` (`v-main tag="div"`); gezinmeden sonra odak `#bo-main` (girişten ilk geçiş hariç, "İçeriğe geç" ilk durak kalır);
  sabit üst bar odağı örtmez (`scroll-padding-top`); Windows yüksek karşıtlıkta odak çizgisi (`forced-colors`, `packages/ui`).
- `BoDataTable` kaydırma bölgesi klavyeyle odaklanır + tablo tipografi rolü (13/20) → 6 sayfadaki yerel `tabindex` yaması kalktı.
- `BoFilterBar`: kalıcı canlı sayaç; "Filtreleri temizle" sonrası odak aramaya. `BoAttentionList` "N madde daha" → odak ilk yeni
  maddeye. `BoPanelState`/`StateBlock` sonradan çıkan hatayı duyurur. `BoPageHeader` "yenilenemedi" duyurulur.
- `BoStatusHeader`: `to` olan olgu artık gerçek bağlantı (href'siz `<a>` hatası; `PageVerdict` geçici yaması kaldırıldı).
- `BoChart`: tümü 0 olan seri "ölçüm yok" demez (gerçek "0 hata" çizilir); yükleme `role=status` + "Grafik yükleniyor…".
  `BoStat`: ⓘ okunur ton, değişim yönü metinle ("artış/azalış"), bağlantılı kutunun adı değişim + bilgiyi içerir.
- `BoTileGrid` otomatik kipte geniş kutu taşmaz; `BoSegmented` devre dışı seçenek görünür biçimde kapalı.
- Komut paleti: arama odağı görünür, yalnız sonuç sayısı canlı, tehlikeli diyalog açıkken Ctrl+K/“/” açmaz.
- Diyaloglar (`EkDialogCard`): `overscroll-behavior: contain`, açıklama kırılır (uzun reqId); iz diyaloğu ileti kırılır, `ms` biçimli.
- Kaydedilmiş görünüm silme → toast'ta **Geri al** + odak sonraki satıra; başka cihazın bildirim aboneliğini kaldırma → onay
  diyaloğu + satır meşgul. Eylem sözlüğü `detail` adı doğal Türkçe ("X ayrıntılarını aç").
- `notifyAuditedAt(metin, { tid })` (`utils/toast.ts`): korumalı yazma sonrası "Denetim kaydını aç".
- `main` eşitlemesine karşı: menü bölüm etiketi okunur ton (axe 0), Yenile ve Loglar sorun düğmesi dokunmada 44 px.

**Giriş / davet / yöneticiler** — sunucu hatası ilgili alanda (aria-invalid + açıklama) ve odak alana; kod/e-posta alanlarında
yazım denetimi/otomatik büyük harf kapalı; "beklenmeyen hata" sonraki adımı söyler; kurtarma kodu indirmesi Safari/Firefox'ta
iptal olmaz. Davet formu ilk hatalı alana odaklanır. "X hesabını etkinleştir".

**Genel bakış** — kullanım özeti "okunamadı" → sonraki adım + Yeniden dene. **Denetim** — süzgeç yaması kalktı (768–1200 px
yatay taşma yok); "Müşteri no" rakam değilse satır içi hata ve sayaçta sayılmaz; "İstek kimliği süzgecini kaldır".
**Loglar** — sorun çekmecesi 390 px'te taşmaz; eğilim hatası Tekrar dene ile, hızlı seçimde eski yanıt yazmaz; sayılar biçimli.
**Müşteriler / müşteri detayı** — uyarı kapsamı kırılır; Kullanım sekmesi ortak `PageVerdict` + `BoStat` (yerel hüküm bloğu
silindi); "geçici erişim" ve "silmeyi geri al" diyaloglarında Etkilenen müşteri.
**Abonelikler** — uzat/plan/iptal diyaloglarında Etkilenen + denetim bağlantısı; devre dışı düğmenin nedeni bağlı; satır
bağlantısı benzersiz ad; gelir sayıları biçimli.
**Motor ve kuyruklar** — `BoTabs`; yeniden dene/at diyaloglarında kuyruk · iş · müşteri; "At" dili tek (diyalog "İş atılsın mı?
/ Gerekçeyle at", toast "atıldı"); etiket = görünen metin; uzun iş kimliği kart satırda kırılır; kalıcı canlı sayaç; kira
serbest bırakmada kapsam + denetim bağlantısı. **Altyapı** — önbellek boşaltmada kapsam + denetim bağlantısı, Redis oranı
`tr-TR`. **Entegrasyonlar** — dayanıklılık zamanı ortak göreli biçim ("3 sa önce").
**Sistem ayarları / Rekabet** — ortak `DraftBar`: "Taslağı at" onay diyaloğuyla (N ayar, geri alınamaz); kayıt hatası her
sekmede tek yerde; ayrılma uyarısı (`useLeaveGuard`); Yenile düzenlemeleri korur; sunucu alan hatasına odak; rekabet hücre
hataları alana bağlı, liste `aria-live=polite`; destek e-posta/telefon doğru tür; geçmişte devre dışı "Geri al" nedeni görünür.
**Bildirimler ve duyurular** — duyuru editörü: Kaydet etkin, tıklanınca satır içi hatalar + ilk hataya odak, ayrılma uyarısı;
uzun başlık/metin/parametre 390 px'te taşmaz; gezinme gerçek bağlantı (`:to`); Sustur/teslim düğmeleri benzersiz ad; sayılar biçimli.
**Otopilot** — "Yeni sohbet" onaylı (`ChatPanel confirmReset`, web varsayılanı değişmez); kurulum gerekiyorsa gerekçesiz form
yerine ayar sayfası bağlantısı; `autofocus` yalnız ince işaretçide; Otopilot ayarı gerekçe alanı satır içi hata + 500 sayaç.

## 3. Atlananlar ve gerekçesi
- **Overengineering:** sanallaştırma (hiçbir liste sayfa başına 50'yi aşmıyor), URL-durum senkronu genişletmesi (ürün kararı:
  hangi durum paylaşılır), `text-wrap: balance`, preconnect (CDN yok), kırılım tutarlılığı (görsel etki yok).
- **Proje deseni kazanır:** gönder düğmesinin geçerli olana dek kapalı olması (EkDialog `confirm-disabled` + görünür ipucu —
  her diyalogda aynı; tek sayfada değiştirmek tutarsızlık yaratır); Title Case (Türkçe cümle düzeni).
- **Ortak paket (web) davranışı:** `EkRelativeTime` ipucunun klavyeyle açılması, `EkToastHost` iç içe canlı bölge, sekme
  `aria-controls` bağı, dar kart kipinde tablo semantiği — web uygulamasını da değiştirir; axe 0 → öneri (P-WDG-4).
- **Veri yok:** davet formunda gizli kullanıcı adı alanı (sayfa e-postayı bilmiyor) → P-WDG-3.
- **Kontrast çifti testleri** (Loglar seçili kategori, Teknik ayrıntılar, Denetim açık satır): e2e axe iki temada 0 ihlal → karşılanıyor.
- **DÜŞÜK (23 madde):** kozmetik/metin cilası — İngilizce enum etiketleri, boş `lede`, `N gün` nbsp, ölü CSS, `title`-yalnız
  açıklamalar, 38 px yerel select, ⌘K gösterimi, theme-color'ın uygulama temasını izlemesi vb. Görünür etkisi küçük; ilgili
  sayfa bir sonraki işte açıldığında (liste AUDIT.md DÜŞÜK son satırı).

## 4. İnceleme rotaları (yerel: `npm run dev:backoffice` → http://localhost:3100)
- Denetim süzgeci (1024–1280 px genişlikte taşma yok; "Müşteri no"ya `abc`): http://localhost:3100/denetim
- Loglar çekmece (390 px; sorun → "Son istekler"): http://localhost:3100/loglar
- Motor sekmeleri ve "at" diyaloğu (Etkilenen satırı, "Gerekçeyle at"): http://localhost:3100/motor?sekme=basarisiz&gorunum=ayrinti
- Kira serbest bırakma: http://localhost:3100/motor?sekme=durum · Önbellek boşalt: http://localhost:3100/altyapi/onbellek
- Abonelik eylemleri (Etkilenen + toast "Denetim kaydını aç"): http://localhost:3100/abonelikler/103?sekme=eylemler
- Müşteri detayı Kullanım sekmesi (ortak hüküm + BoStat): http://localhost:3100/musteriler/102?sekme=kullanim
- Sistem ayarları taslak at onayı + ayrılma uyarısı (bir değeri değiştirip başka menüye geçin): http://localhost:3100/sistem/bayraklar
- Rekabet plan tablosu hücre hatası: http://localhost:3100/sistem/rekabet
- Duyuru editörü (boşken Kaydet → hatalar + odak; doldurup Vazgeç → onay): http://localhost:3100/sistem/duyurular/yeni
- Otopilot "Yeni sohbet" onayı (konsolda `window.__BO_CHAT_MOCK__={config:'enabled',speed:1}` + yenile): http://localhost:3100/otopilot
- Kaydedilmiş görünüm sil → Geri al: http://localhost:3100/loglar (Görünümler menüsü)
- Giriş alan hatası (yanlış kod `000000`): http://localhost:3100/giris
- Klavye: herhangi bir ekranda Tab → "İçeriğe geç"; menüden ekran değiştirince odak içerikte; Windows'ta Yüksek karşıtlık ile odak çizgisi.
- Kareler: `docs/bo-wdg/once/` ↔ `sonra/` (görünür fark eden 6 ekran × 1440 açık/koyu + 390 açık: 08 motor, 09 başarısız
  işler, 13 loglar, 14 denetim, 16 sistem ayarları, 24 duyuru editörü). Not: örnek veri saate bağlıdır; satır sırası/sayılar
  kareler arasında saat farkından değişir. Menüdeki sayaç rozetleri `main` eşitlemesinden gelir.

## 5. Test sonuçları (`cloud/bo-wdg` son hâli)
- `npm run test:backoffice`: backoffice **35 dosya / 368 test geçti**; `@entegrasyonik/ui` **6 / 43 geçti** (yeni:
  `leave-guard.test.ts` 6, `r2-charts-actions` detay adı; r2-system yerel kopya mandalı 0 korundu).
- `npm run test:chat`: **14 dosya / 190 geçti, 1 atlandı** (yeni `panel-reset.test.ts` 4: varsayılan davranış aynı + onay yolu).
- `vue-tsc -p backoffice/tsconfig.json`: **0 hata**. `build:backoffice` ✓ · `build` (web) ✓.
- Ratchet: pattern **OK (324 dosya)**, no-console **OK**, contract-paths **OK (173 kanca)**.
- Backoffice Playwright tam koşu (3 proje, `--update-snapshots=missing`): **389 geçti, 0 kaldı, 172 atlandı** (atlananlar
  `BO_REVIEW=1` inceleme kareleri ve projeye özgü testler); **axe ihlali 0** (iki tema). Son tam koşuda 5 kayıt yalnız eksik
  linux görsel tabanı yazımı / saate bağlı örnek veriyle eskiyen yerel linux tabanıydı; yeniden üretilince `smoke.spec.ts:73`
  12/12 geçti. `*-linux.png` commit'lenmedi.
- Web sohbet spec'leri (`otopilot`, `otopilot-harness`, `otopilot-review`; chromium): **116 geçti, 69 atlandı, 1 kaldı** —
  `otopilot.spec.ts:48` (web komut paleti ilk tuşları yutuyor). **bo-wdg'den değil:** paket değişikliklerim geri alınınca da,
  ve yalın `origin/cloud/bo-r2b` üzerinde de kalıyor; yalın `origin/main` üzerinde geçiyor → bo-r2b zincirindeki web
  değişikliği + main birleşimi. Web uygulaması kapsam dışı; yerel oturuma bırakıldı.
- Web `npx vitest run`: **1745 geçti, 19 kaldı** — **18'i yalın `origin/main`'de de kalıyor** (main eşitlemesi `199628a5`:
  a6b/a7/a8/a10/a12/b4/motion-single-source/vuetify-theme); 1'i (`fe-cfg-rest` — `BrandListComponent.vue:139` `limit: 25`)
  main'in yeni dosyası ile bo-r2b zincirindeki FE-CFG testinin birleşimi. Önerilen tek satır: `limit: defaultListPageSize()`
  (`@/stores/publicConfig`). Web `typecheck-ratchet` (2 hata) ve `style-ratchet` (`EkWorkspaceTabs` 0→2) de yalın main'de aynı.
  Hiçbiri bo-wdg değişikliğinden değil; web kodu kapsam dışı olduğu için düzeltilmedi.

## 6. PROPOSALS_PENDING (karar bekleyen)
- **P-WDG-1 Tek tuş kısayollarını kapatma** (WCAG 2.1.4): hesap menüsünde "Tek tuş kısayolları" anahtarı (j/k/?/g+harf).
- **P-WDG-2 Göreli zaman tek biçim:** üst bar "3 dakika önce" (Intl) ↔ paket "3 dk önce"; hangisi standart?
- **P-WDG-3 Davet önizleme ucu:** davet bileti → e-posta (salt okuma) → parola yöneticisi için gizli kullanıcı adı alanı (BE).
- **P-WDG-4 Ortak paket erişilebilirlik turu** (web + backoffice birlikte): `EkRelativeTime` klavyeyle mutlak zaman, `EkToastHost`
  tek canlı bölge + eylemli toast'ın süresiz kalması, `EkPageTabs` sekme–panel bağı, `EkDataTable` dar kart kipinde açık rol,
  boş eylem `th` başlığı. Web davranışını da değiştirdiği için K48 gereği onaya bırakıldı.
- **P-WDG-5 Kullanım sekmesinde tek hüküm:** müşteri detayı sayfa hükmünün altında Kullanım sekmesi kendi `PageVerdict`'ini
  gösteriyor (iki durum başlığı). P-CFG-4'teki "kompakt hüküm" çeşidi bunu çözer.
- **P-WDG-6 Otopilot yan paneli (`OtopilotDock`)** de `confirmReset` ve kurulum bağlantısını alsın (bu işte yalnız tam sayfa).
- **P-WDG-7 Gönder düğmesi deseni:** kılavuz "istek başlayana dek etkin, hatayı gönderimde göster" der; proje deseni "geçerli
  olana dek kapalı + ipucu". Duyuru editöründe kılavuz uygulandı; diyaloglar için tek karar gerekir.
- **P-WDG-8 Web uygulaması kırmızıları** (bu dalda görülen, main kaynaklı): §5'teki 19 vitest + `otopilot.spec.ts:48` +
  ratchet'ler — yerel oturumda main üzerinde ele alınmalı.
