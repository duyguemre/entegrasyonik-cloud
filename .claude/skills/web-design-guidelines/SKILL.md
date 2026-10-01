---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices". Entegrasyonik'te web uygulaması, backoffice ve tanıtım sitesi denetimlerinde premium-ui-standards ile birlikte kullan.
metadata:
  author: vercel (uyarlama: Entegrasyonik)
  version: "1.0.0"
  source: https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines (MIT)
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the rules from `guidelines.md` in this skill folder (local copy, works offline / in the cloud sandbox). If network is available you MAY fetch the latest version from the source URL below and note any difference, but the local copy is authoritative when the fetch fails.
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the guidelines, applying the project adaptation below
4. Output findings in the terse `file:line` format

## Guidelines Source

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

## Usage

When a user provides a file or pattern argument:
1. Read `guidelines.md` (optionally refresh from the source URL)
2. Read the specified files
3. Apply all rules, adapted as below
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.

## Proje uyarlaması (Entegrasyonik)

Öncelik sırası: kullanıcının kendi sözü (docs/adr/USER_DECISIONS.md) → proje standartları (`premium-ui-standards`, `frontend/docs/DESIGN_SYSTEM.md`, `frontend/backoffice/docs/BO_UI_PATTERNS.md`, site tasarım belgeleri) → bu kurallar. Çelişkide proje kazanır; bulguyu "proje kuralı gereği uygulanmadı" diye not et.

- **Yığın:** Vue 3 + Vuetify (web, backoffice), Astro (site). React/Next'e özgü kuralları (`useState`, `nuqs`, `suppressHydrationWarning`, `onKeyDown` adlandırması) Vue/Astro karşılığıyla oku: `@keydown`, `v-model`, router query, Astro statik çıktı. Hidrasyon kuralları yalnız Astro adalarında geçerli.
- **Metin dili Türkçe:** "Title Case" kuralı UYGULANMAZ. Türkçe cümle düzeni kullanılır (ör. "Bu plana geç", K-kararları). "İkinci şahıs" kuralı projenin hitap kararlarıyla birlikte okunur ("müşteri" yerine "alıcı" vb., site K43–K46). Tırnak/üç nokta/boşluk kuralları Türkçe yazıma uygulanır (`…`, `“ ”`, `10&nbsp;GB`).
- **Yerel biçim:** `Intl.DateTimeFormat` / `Intl.NumberFormat` `tr-TR` ile; para birimi projenin tek para biçimi yardımcısından (P01).
- **Hareket:** premium-ui-standards hareket yasakları (bounce/elastic, confetti) bu kurallardan önce gelir; `prefers-reduced-motion` her animasyonda zorunlu.
- **Kritiklik sınıflandırması (denetim raporlarında):** `KRİTİK` (erişilebilirlik engeli, veri kaybı/yıkıcı eylem onaysız, okunamaz kontrast, klavyeyle erişilemeyen eylem, yatay taşma), `YÜKSEK` (odak görünürlüğü, form etiket/hata, tutarsız ortak davranış, belirgin görsel kusur), `ORTA` (tipografi incelikleri, tabular-nums, boş durum, hover durumları), `DÜŞÜK` (kozmetik, metin cilası). Overengineering sayılanlar (sanallaştırma eşiği altındaki listeler, ölçek gerektirmeyen performans mikro optimizasyonları, ürün kararı gerektiren URL-durum senkronu) `ATLANDI` olarak gerekçesiyle listelenir.
