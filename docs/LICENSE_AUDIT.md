# Lisans Taraması (C18 kapsamı) — 2026-09-27

**Araç:** `license-checker@25.0.1` (npx ile çalıştırıldı, kuruluma ihtiyaç yok, network erişimi yalnızca `npx`'in kendi paketini indirmesi için gerekti — kaynak kod taraması tamamen yerel `node_modules`/`package.json` üzerinden yapıldı, hiçbir üçüncü taraf sunucuya istek atılmadı).

**Kapsam:** `backend/` ve `frontend/`, her biri için hem `--production` (yalnızca runtime bağımlılıkları) hem tam ağaç (dev dahil) ayrı ayrı tarandı. Ham JSON çıktılar geçici scratchpad'de tutuldu, bu dosyaya yalnızca özet/bulgular yazıldı (repo'ya JSON commit edilmedi).

## Özet sayılar

| Tarama | Paket sayısı (kök paket dahil) |
|---|---|
| backend production | 406 |
| backend tüm ağaç (dev dahil) | 786 (dev-only fark: 380) |
| frontend production | 221 |
| frontend tüm ağaç (dev dahil) | 698 (dev-only fark: 477) |

**UNKNOWN/lisanssız paket:** 0 (dört taramanın hiçbirinde `UNKNOWN` yok — tüm paketlerin `package.json`'ında veya lisans dosyasında SPDX ile tanınabilir bir lisans var).

## Lisans dağılımı

### Backend — production (406 paket)
MIT 242, Apache-2.0 129, ISC 19, BlueOak-1.0.0 5, BSD-3-Clause 4, BSD-2-Clause 3, `(MIT OR WTFPL)` 1, MIT-0 1, `(BSD-2-Clause OR MIT OR Apache-2.0)` 1, 0BSD 1.
**Kopyleft (GPL/AGPL/LGPL/SSPL/MPL/EPL) yok.**

### Backend — tüm ağaç, dev dahil (786 paket)
MIT 560, Apache-2.0 136, ISC 41, BSD-3-Clause 21, BSD-2-Clause 11, BlueOak-1.0.0 10, `(MIT OR CC0-1.0)` 2, CC-BY-4.0 1 (`caniuse-lite`, veri lisansı, attribution gerektirir, kod değil), `(MIT OR WTFPL)` 1, MIT-0 1, `(BSD-2-Clause OR MIT OR Apache-2.0)` 1, 0BSD 1.
**Kopyleft yok** (dev-only 380 ekstra pakette de hiç GPL/AGPL/LGPL/SSPL/MPL/EPL yok).

### Frontend — production (221 paket)
MIT 164, **GPL-2.0-or-later 34**, Apache-2.0 8, BSD-3-Clause 6, ISC 5, BSD-2-Clause 2, `Custom: https://vitejs.dev/config/` 1 (bu aslında kök `client@1.0.0` paketinin kendisi — license-checker README'yi lisans dosyası sanmış, üçüncü taraf bağımlılık değil), 0BSD 1.

### Frontend — tüm ağaç, dev dahil (698 paket)
MIT 556, ISC 59, **GPL-2.0-or-later 34** (production ile aynı küme, dev'de ek yok), Apache-2.0 19, BSD-3-Clause 12, BSD-2-Clause 9, `(MIT OR CC0-1.0)` 3, CC-BY-4.0 1 (`caniuse-lite`), `Custom:...` 1 (kök paket), BlueOak-1.0.0 1, CC-BY-3.0 1 (`spdx-exceptions`, license-checker'ın kendi bağımlılığı), CC0-1.0 1 (`spdx-license-ids`), 0BSD 1.
**AGPL/SSPL yok.** LGPL/MPL/EPL yok.

## Riskli bulgu — İSİMLE: CKEditor 5 paket ailesi (GPL-2.0-or-later, frontend production)

`frontend/package.json`'da doğrudan bağımlılık olarak listelenen ve **aktif kullanılan** (`src/main.ts`, `src/views/secure/definitions/ProductDefinitionView.vue`, `src/views/secure/definitions/ProductUpdateView.vue` içinde import edilen; ürün açıklaması zengin metin editörü) iki paket —

- `@ckeditor/ckeditor5-build-classic@40.2.0`
- `@ckeditor/ckeditor5-vue@5.1.0`

— transitive olarak 32 adet `@ckeditor/ckeditor5-*` alt paketi ve `ckeditor5@40.2.0` çekiyor; **bu 34 paketin tamamı `GPL-2.0-or-later` altında lisanslı.**

**Risk değerlendirmesi (SaaS/host-only bağlam için özellikle kontrol edildi):** CKEditor 5, CKSource tarafından **çift lisanslı** dağıtılır: açık kaynak sürüm GPL-2.0-or-later, kapalı kaynak/ticari kullanım için ayrı bir ticari lisans satılır (bu ikinci lisans bu tarama/paket meta verisinde görünmez, package.json'daki SPDX alanı yalnızca GPL'i gösterir). AGPL'in aksine GPL'in tetikleyicisi "ağ üzerinden kullanım" değil **dağıtımdır** — ancak burada Entegrasyonik'in frontend bundle'ı derlenip her tarayıcıya JS olarak gönderiliyor (`vite build` çıktısı istemciye servis ediliyor); bu, GPL'in "kopya dağıtımı" tanımını tetikleyen, yaygın kabul gören bir yorumdur (web ekosisteminde JS bundle'ının tarayıcıya gönderilmesi dağıtım sayılır). Entegrasyonik kapalı kaynaklı, ticari bir SaaS ürünü olduğundan, GPL sürümünü ticari lisans satın almadan üretimde dağıtmak **gerçek bir lisans uyum riski taşır** (CKSource'un GPL FAQ'ı kapalı kaynak ticari ürünlerde GPL sürümünün kullanılmasını "uyumsuz" sayar ve ticari lisans satın alınmasını şart koşar).

**Risk seviyesi: YÜKSEK** (aktif kullanım + kapalı kaynak ticari SaaS + dağıtılan bundle içinde + resmi çift-lisans politikası açık).

**Not — kararı büyütmedim:** Bu bir mimari/ticari karar (ticari lisans satın al / editörü değiştir / hukuki görüş al) olduğundan kendi başıma seçim yapmadım; öneri aşağıda "sonraki adım" olarak bırakıldı, insan onayı gerekir.

### DÜZELTİLDİ (2026-09-27, kullanıcı onayıyla)

`@ckeditor/ckeditor5-build-classic` ve `@ckeditor/ckeditor5-vue` (ve bunların çektiği 32 alt `@ckeditor/ckeditor5-*` paketi, toplam 34 GPL-2.0-or-later paket) kaldırıldı; yerine zaten `frontend/package.json`'da kurulu ama kullanılmayan **MIT** lisanslı `@vueup/vue-quill@^1.2.0` geçirildi. Değişen dosyalar: `frontend/src/main.ts` (global `CKEditor` plugin kaydı kaldırıldı — vue-quill global plugin gerektirmiyor, `QuillEditor` bileşeni her kullanım yerinde doğrudan import ediliyor), `frontend/src/views/secure/definitions/ProductDefinitionView.vue`, `frontend/src/views/secure/definitions/ProductUpdateView.vue` (`<ckeditor>` → `<QuillEditor v-model:content="..." content-type="html" theme="snow" :toolbar="quillToolbar" />`), `frontend/package.json` + `package-lock.json` (`npm install` ile 37 paket kaldırıldı, `node_modules/@ckeditor` artık yok).

`productInfoForm.description` davranışı KORUNDU: hâlâ HTML string olarak backend'e gönderiliyor/backend'den okunuyor (`content-type="html"` + `v-model:content` deseni bunu sağlıyor, doğrulandı).

**Toolbar eşdeğerliği — birebir DEĞİL, açıkça belirtiliyor:** Orijinal `editorConfig`'de toolbar override'ı zaten yorum satırındaydı (kullanılmıyordu), yani gerçek davranış CKEditor5 Classic build'in **varsayılan** toolbar'ıydı (başlık, kalın, italik, link, madde/numara listesi, girinti, alıntı, tablo, medya gömme, resim yükleme, geri al/ileri al). Yeni Quill toolbar'ı (`quillToolbar`, ilgili `.vue` dosyalarında tanımlı) şunları sağlıyor: başlık (1-3), kalın, italik, altı çizili, madde/numara listesi, girinti, alıntı, link, biçimlendirmeyi temizle. **Eksik/eşdeğersiz kalanlar:** tablo ekleme, medya gömme ve resim yükleme toolbar düğmeleri Quill çekirdeğinde yok (ek modül gerektirir, bu göreve dahil edilmedi); geri al/ileri al Quill'de toolbar düğmesi olarak değil klavye kısayoluyla (Ctrl+Z/Ctrl+Y) çalışıyor. Bu özellikler zaten pratikte kullanılıyor muydu doğrulanamadı (backend'e image-upload adaptörü tanımlı değildi, muhtemelen fiilen çalışmıyordu) — ancak "tam eşdeğer" iddiası burada bilinçli olarak yapılmıyor.

**Doğrulama:** `npm install` → 37 paket kaldırıldı, `node_modules/@ckeditor` yok, `package-lock.json`'da `ckeditor5` referansı sıfır. `npx vite build` (bundler/derleme adımı) 2530 modül ile hatasız tamamlandı, çıktı bundle'da `ckeditor`/`CKEditor` stringi yok, `Quill` var. `npm run build`'ün `vue-tsc --noEmit` adımı ve `npm run dev` (Vite dep-scan) bu görevden **bağımsız, önceden var olan** hatalarla başarısız oluyor (`git stash` ile taban commit'te de aynı hatalar doğrulandı: `EmptyState.vue.js`/`PlatformImageComponent.vue.js` "phantom" tip hataları; `ChoicesSyncComponent.vue`'nin var olmayan `CategorySelectBoxComponent.vue` importu) — bu nedenle canlı tarayıcı/Vue-devtools ile görsel doğrulama bu görev kapsamında yapılamadı; ayrı bir Faz 3 maddesi olarak not düşüldü (bkz. `BACKLOG.md`).

**Yararlı ek bulgu (2026-09-27'de uygulandı, bkz. yukarıdaki "DÜZELTİLDİ" bölümü):** `frontend/package.json`'da zaten MIT lisanslı bir alternatif editör paketi (`@vueup/vue-quill@1.5.5`, Quill tabanlı) bağımlılık ağacında duruyordu ama `src/` içinde hiçbir yerde import edilmiyordu (kullanılmayan bağımlılık). Bu paket CKEditor5'in yerini almak için kullanıldı.

## Diğer düşük risk / bilgi amaçlı bulgular

| Paket | Lisans | Kapsam | Risk | Not |
|---|---|---|---|---|
| `caniuse-lite@1.0.30001812` | CC-BY-4.0 | backend+frontend (dev-only, browserslist zinciri) | Düşük | Veri paketi (kod değil), build-time kullanılır, runtime bundle'a girmez; attribution zaten paket içinde |
| `spdx-exceptions@2.5.0` | CC-BY-3.0 | frontend (license-checker'ın kendi transitive'i) | Yok | Yalnızca bu tarama aracının kendi bağımlılığı, üretime hiç girmiyor |
| `spdx-license-ids@3.0.24` | CC0-1.0 | frontend (aynı) | Yok | Aynı, kamu malı (public domain) |
| `type-fest@*` (çeşitli sürümler) | `(MIT OR CC0-1.0)` | backend+frontend | Yok | Çift seçenekli, MIT tercih edilebilir |
| `client@1.0.0` (kök `frontend/package.json`) | `Custom: https://vitejs.dev/config/` | frontend | Yok | Üçüncü taraf değil — projenin kendi paketi; license-checker README'yi yanlış lisans dosyası sanmış (kozmetik) |

## Sonuç

- **Backend:** tarandı, kritik risk bulunmadı. Production ve dev dahil tüm ağaçta kopyleft (GPL/AGPL/LGPL/SSPL/MPL/EPL) veya lisanssız (UNKNOWN) paket yok. Tamamı MIT/Apache-2.0/BSD/ISC/BlueOak/0BSD ailesinden izin verici (permissive) lisanslar.
- **Frontend:** tarandı, **1 gerçek yüksek risk bulundu**: CKEditor 5 paket ailesi (34 paket, GPL-2.0-or-later, aktif kullanımda). **DÜZELTİLDİ (2026-09-27):** kullanıcı onayıyla MIT lisanslı `@vueup/vue-quill`'e geçirildi, bkz. yukarıdaki "DÜZELTİLDİ" bölümü. Bunun dışında kritik risk yok; geri kalan tüm paketler izin verici lisanslardan.

## `site/` (tanıtım sitesi, ADR-0014 S0) — 2026-09-28

Sabitlenen sürümler: `astro@7.3.5` (MIT), `@astrojs/sitemap@3.7.4` (MIT), `@fontsource/inter@5.3.0` (**OFL-1.1**, yazı tipi; dosyalar self-host); dev: `vitest@3.2.7` (MIT), `@playwright/test@1.63.0` (Apache-2.0), `@axe-core/playwright@4.13.0` (MPL-2.0; yalnızca test), `lighthouse@12.8.2` (Apache-2.0; 13.x Node >=22.19 ister, repo Node'u 22.12), `chrome-launcher@1.2.0` (Apache-2.0).

`license-checker@25.0.1 --production` (195 paket): MIT 162, ISC 8, BSD-2-Clause 8, Apache-2.0 4, BlueOak-1.0.0 3, BSD-3-Clause 3, MPL-2.0 2, CC0-1.0 2, OFL-1.1 1, Python-2.0 1 (`argparse`), `Apache-2.0 AND LGPL-3.0-or-later` 1. **GPL/AGPL/SSPL yok.** Siteye dağıtılan (dist) üçüncü taraf KOD yok — üretilen JS yalnızca kendi kodumuz (~0,3 KB gzip); dağıtılan üçüncü taraf varlık yalnızca Inter fontu (OFL).
Dikkat edilenler (hepsi yalnızca DERLEME ZAMANI araçları, siteye dağıtılmaz): `lightningcss` (MPL-2.0, Vite/Astro CSS işleyicisi), `@img/sharp-*` (Apache-2.0 AND LGPL-3.0-or-later — libvips ön-derlenmiş ikili, Astro görüntü hizmeti bağımlılığı; S0'da görüntü işleme kullanılmıyor). `npm audit`: yalnızca `lighthouse` (devDependency) → `@sentry/node` → `@opentelemetry/core` zincirinde 1 "moderate" (yerel ölçüm aracı, ağa açık değil); `npm audit fix --force` lighthouse'u eski sürüme çekeceği için uygulanmadı.

## Tekrarlanabilirlik

`backend/package.json` ve `frontend/package.json`'a `license-check` script'i eklendi:

```bash
license-checker --production --summary --excludePrivatePackages
```

CI'da veya lokal olarak `npm run license-check` ile production bağımlılıklarının lisans özetini (paket sayısı lisans başına) hızlıca almak için kullanılabilir; tam/dev dahil derinlemesine tarama için bu dosyadaki `npx license-checker --json` komutları elle tekrarlanabilir.
