# fe-r3d — devir notu (ilk oturum → "FE-R3D devam" oturumu)

İlk oturum (session_01DAgnCFc9dCGcT1ZXztKMgZ) ikinci oturumun aynı dala push ettiğini görünce (d05584a7, P16) yarışmamak için
burada durdu. Dal tutarlı ve push'lu; aşağıdakiler TAMAM, kalanlar ikinci oturumda.

## Tamamlanan (commit)
| Madde | Commit | Not |
|---|---|---|
| Birleşim r3a → r3b → r3c | 6e489b31, a28b3acd, be46482f | Tek çakışma PROPOSALS_PENDING (iki bölüm korundu). Birleşik tabanda vitest 1577/1577, vue-tsc 0, build + build:backoffice OK |
| APP_IDENTITY taslağı | (ilk commit, `frontend/docs/APP_IDENTITY.md`) | 9 ilke + yap/yapma + ekran örneği + denetim listesi; denetim sonuçlarıyla güncellenecek |
| P01 tek para biçimi ₺1.048,80 + P08 "Sınırsız" | 19705fa8 | financial.spec beklentileri güncellendi |
| P02 "Tümü" kalktı + P10 Kanal ilk | 30711b98 | |
| P07 Parola + P13 tek sıfırlama girişi | e453c483 | login/password-reset/a3/admin spec'leri güncellendi |
| P05 tek ad + P06 Destek talepleri + P11 Ayarlar bölümü | db65f7d1 | `menuShape.ts` `regroupMenu` + tek yapraklı destek grubu düzleşir (yalnız TicketListView; P-R3A-5 onaysız, dokunulmadı); test `tests/r3d-menu-regroup.test.ts` |
| P12 e-fatura kısa adları | 3edac58e | `EINVOICE_PROVIDERS` (TEF/TCL/ELG/GİB, nötr renk) |
| P16 | d05584a7 (ikinci oturum) | ilk oturumun eşdeğeri atıldı, ikinci oturumunki korundu |
| P14 + P15 | 3377f130 | Tur kartı: açık katmanda gizli, z-header, `data-ek-sticky-bottom` çubuğun üstüne; liste kartı min 340px, EkListScreen kendi içinde kayar (tablo iç kaydırması korunur); list-standard spec'i bu davranışa göre |

## Kalan
- P03 (sekmeli ekranlarda arama+yenile başlıkta), P04 (kolon önceliği), P-MCP-1 (öneri = mevcut adlar; kapatılabilir), P-MCP-2 (onay önizlemesi sohbet paketine)
- PROPOSALS_PENDING'de P01–P16/P-MCP maddelerini "KARAR: uygulandı (commit)" ile kapatmak; P-R3A/B/C maddeleri K49 SONRASI yazıldı → onaysız, yeni onay listesine
- Backend istekleri: P08 plan `unlimited` bayrağı, P09 denetim günlüğü neden kodu kataloğu, P11 menü verisinde kalıcı grup düzeni, P07 e-posta şablonlarında "parola", P-R3A-1..3, C01–C05
- APP_IDENTITY denetimi (light+dark, 1440+390; `fe-polish-review.spec.ts` POLISH_OUT=docs/fe-r3d-review/...), tam test koşusu, rapor
- Bilinen: `npm run test:backoffice` 1 kırık (p2-states REAUTH: backend `retryJobs` eklemiş) — origin/main'de de aynı
- Bulutta ilk koşuda `-linux.png` tabanı yazılırken ekran görüntüsü testleri "kırık" görünür; ikinci koşu geçer
