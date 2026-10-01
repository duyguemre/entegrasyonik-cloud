# FR3 ortak desenleri (fe-r3a — kabuk, menü, sekmeler, filtre, tablo, hareket)

Kaynak: `docs/cloud-contracts/FE_FEEDBACK_R3_2026-10-01.md` madde 1–10, karar K49. FR2 standartları (`FR2_PATTERNS.md`)
geçerliliğini korur; bu dosya onları **genişletir**. Paralel görevler (`cloud/fe-r3b` ekranlar, `cloud/fe-r3c` çıktılar)
burada anlatılanı **kullanır**; ortak bileşen/token değişikliği yalnız `frontend/packages/ui`'dadır (K11).

## 1. Hareket — tek kaynak (madde 7)

Bileşen **süre/eğri seçmez, etkileşimin türünü (rolü) seçer**. Aynı tür her yerde aynı hızda akar: filtre paneli
açılışı = ürün formundaki kategori seviyesi açılışı = menü grubu açılışı → hepsi `reveal`.

| Rol (CSS) | Süre · eğri | Ne zaman |
|---|---|---|
| `--ek-motion-feedback` | fast 150ms · ease-out | Hover, odak, seçili durumda renk/zemin/kenarlık/gölge/opaklık (`--ek-transition-colors` bunu kullanır) |
| `--ek-motion-reveal` | base 200ms · ease-in-out | Aç/kapa: yükseklik + opaklık (EkCollapse, filtre paneli, sayfa hakkında, menü grubu, kategori seviyesi, akordeon), ok dönüşü, genişleyen satır |
| `--ek-motion-dismiss` | fast 150ms · ease-in-out | Kaybolan geçici öğe (menü/diyalog çıkışı, kapanan kolon, silinen satır). Çıkış girişten hep kısa |
| `--ek-motion-overlay` | base 200ms · ease-out | Yükselen katman girişi: menü, açılır liste, diyalog, toast, sekme içeriği (opaklık + `--ek-motion-distance-sm` kayma) |
| `--ek-motion-layout` | slow 300ms · ease-out | Kabuk/yerleşim: sol menü ray ↔ tam |
| `--ek-motion-stagger` | fast / 3 | Kademeli öğeler arası adım (en fazla 2 adım) |
| `--ek-motion-loop-pulse` · `-brand` · `-flow` · `-spin` · `-transfer` | 1400 · 1800 · 1000 · 900 · 8000ms | YALNIZ bekleme döngüleri (iskelet, marka yükleyicisi, yazıyor/akış çizgisi, yenile dönüşü, aktarım gösterimi); eğri `--ek-easing-standard` (sabit hız `--ek-easing-linear`) |

Her rolün `-duration` ve `-easing` parçası da vardır (`transition-delay: var(--ek-motion-reveal-duration)` gibi).

```css
.my-panel { transition: grid-template-rows var(--ek-motion-reveal), opacity var(--ek-motion-reveal); }
.my-menu-enter-active { transition: opacity var(--ek-motion-overlay), transform var(--ek-motion-overlay); }
.my-menu-leave-active { transition: opacity var(--ek-motion-dismiss); }
.my-row { transition: var(--ek-transition-colors); }          /* hover */
.my-step { transition-delay: calc(var(--i) * var(--ek-motion-stagger)); }
```

JS (Web Animations, SortableJS, kaydırma): `@entegrasyonik/ui/motion` → `motionMs(rol)`, `motionEasing(rol)`,
`motionDistancePx('sm')`, `motionReduced()`. Azaltılmış harekette (`prefers-reduced-motion` veya
`<html data-motion="reduced">`) `motionMs` 0 döner; CSS'te kök süreler 0'a indiği için roller de iner.

**Yasak** (bekçi `tests/motion-single-source.test.ts`): CSS'te literal süre (`.3s`, `200ms`; `0s` serbest), eğri anahtar
kelimesi (`ease`, `ease-in-out`, `linear` …), `cubic-bezier(`; bileşende ham ölçek token'ı (`--ek-duration-*`, döngü
dışında `--ek-easing-*`); script'te ham `easing: 'ease-…'`, `cubic-bezier`, hareket modülü olmadan `.animate(`.
Paralel görevlerin dört dosyası (`PrintoutListView`, `SettingListView`, `ProductListView`, `ProductChannelStatus`) ham ölçek
token'ı için ratchet listesindedir — dokunduğunuzda role geçirin, sayı düşer; **artamaz**.

Vuetify'ın kendi adlandırılmış geçişleri (`fade-transition`, `scale-transition`, `dialog-transition` …) ve bileşen mikro
geçişleri (düğme/liste/çip katmanı, sekme, seçim denetimi, perde) `vuetify-overrides.css`'te rollere bağlıdır; test listeyi
`node_modules/vuetify` CSS'inden türetir. Bilinen istisna: Vuetify'ın JS ile yaptığı iki FLIP (alan etiketi yüzmesi
~150ms, `v-tabs` kaydırıcısı) — `EkPageTabs` artık kaydırıcı kullanmaz (bkz. §4).
