import { describe, expect, it } from 'vitest'
import baseline from './theme-snapshot.baseline.json'
import { normalizeColorMap } from './normalizeColor'

/**
 * ADR-0011 Karar 2 / Aşama 0 — tema characterization anlık görüntüsü.
 * **ADR-0015 Karar 5.2 (A1) — KASITLI olarak ters çevrildi (2026-09-28).**
 *
 * Bu testin YAPISI (Vuetify'ın gerçekten ürettiği çalışma-anı renk
 * haritasını normalize edip commit'li bir tabanla karşılaştırma) AYNEN
 * kalır (Protokol 13 karakterizasyon disiplini) — yalnızca TABAN VERİ
 * (`theme-snapshot.baseline.json`) ve buradaki birkaç sabit sayı/iddia
 * güncellendi, çünkü:
 *   1. Durum renkleri (success/warning/error/info) ADR-0015 Karar 3.3'ün
 *      WCAG AA durum paletiyle DEĞİŞTİ (ADR-0011 Açık Soru 4 kararı).
 *   2. `vuetify-theme.ts` artık TÜM semantik anahtarları (Core+New, 28)
 *      hem light hem dark canlı temaya kablar (Aşama 0'da yalnızca
 *      13 çekirdek + dark'ta "yeni" anahtar YOKTU) — bu yüzden anahtar
 *      SAYILARI da değişti (bkz. aşağıdaki 2 test).
 *
 * Normalize adımı (`normalizeColorMap`) Vuetify'ın `parseColor`/`RGBtoHex`
 * (node_modules/vuetify/lib/util/colorUtils.js) ile aynı mantığı taşır:
 * baştaki `#` isteğe bağlıdır, 3 haneli kısaltmalar 6 haneye açılır.
 */
describe('vuetify.ts tema characterization ("sonra" durumu — ADR-0015 A1, kasıtlı ters çevirme)', () => {
  async function loadNormalizedThemes() {
    const mod: any = await import('../../src/plugins/vuetify')
    const vuetify = mod.default
    const themes = vuetify.theme.themes.value
    return {
      lightTheme: normalizeColorMap(themes.lightTheme.colors),
      darkTheme: normalizeColorMap(themes.darkTheme.colors),
    }
  }

  it('lightTheme normalize edilmiş renk haritası, tabana bit-bit eşittir', async () => {
    const { lightTheme } = await loadNormalizedThemes()
    expect(lightTheme).toEqual(baseline.lightTheme)
  })

  it('darkTheme normalize edilmiş renk haritası, tabana bit-bit eşittir', async () => {
    const { darkTheme } = await loadNormalizedThemes()
    expect(darkTheme).toEqual(baseline.darkTheme)
  })

  it('lightTheme 72 anahtar üretir (ADR-0015 A1: 28 semantik [13 çekirdek + 15 yeni] + 43 legacy anahtarın TAMAMI + Vuetify\'ın override edilmeyen tek çekirdek varsayılanı "on-surface-variant")', async () => {
    const { lightTheme } = await loadNormalizedThemes()
    expect(Object.keys(lightTheme)).toHaveLength(72)
  })

  it('darkTheme 41 anahtar üretir (ADR-0015 A1: 28 semantik [13 çekirdek + 15 yeni, TÜMÜ artık dark\'ta da kablı] + yalnızca DARK_WIRED_LEGACY_KEYS\'teki 12 legacy anahtar + "on-surface-variant")', async () => {
    const { darkTheme } = await loadNormalizedThemes()
    expect(Object.keys(darkTheme)).toHaveLength(41)
  })

  it('GİZLİ DAVRANIŞ (şüpheli, BACKLOG.md\'de kayıtlı): darkTheme anahtar kümesi lightTheme\'in bir ALT KÜMESİ değil — ör. lightTheme\'deki "smartSearchColor", "borderColor", "amber" gibi ~35 özel anahtar darkTheme\'de HİÇ tanımlı değil (dark\'a geçildiğinde bu anahtarları kullanan sınıflar/CSS değişkenleri tanımsız kalır — ADR Bağlam madde 5, "loginColor" ile aynı kırık kalıbı). Kullanıcı anahtarı zaten kapalı (Karar 3) olduğu için bugün gözlemlenebilir bir etkisi yok; token omurgası bu anahtar kümesi eşitliğini TS tipiyle zorlayacak (Karar 1).', async () => {
    const { lightTheme, darkTheme } = await loadNormalizedThemes()
    const lightOnlyKeys = Object.keys(lightTheme).filter((k) => !(k in darkTheme))
    // Bugünkü (2026-09-27) gerçek sayı: değişirse bu ADR bulgusu yeniden
    // doğrulanmalı, testin kendisi "olması gereken" bir sayı iddia etmiyor.
    expect(lightOnlyKeys.length).toBeGreaterThan(0)
    expect(lightOnlyKeys).toContain('smartSearchColor')
    expect(lightOnlyKeys).toContain('borderColor')
  })

  it('[ADR-0015 Karar 3.3, A1 — KASITLI ters çevirme] "danger" ve "info" artık YENİ durum paletinin değerlerini taşıyor (eski AA-altı "#E53935"/"#00ACC1" DEĞİL); yazım biçimi hâlâ "#" ile normalize (6 haneli), normalize idempotent kalır', async () => {
    const mod: any = await import('../../src/plugins/vuetify')
    const vuetify = mod.default
    const themes = vuetify.theme.themes.value
    // legacy `danger` artık yeni `error` tonuyla (red-700) hizalı (Karar 3.3 "legacy danger eşlemesi").
    expect(themes.lightTheme.colors.danger).toBe('#B91C1C')
    expect(themes.lightTheme.colors.info).toBe('#0369A1')
    expect(themes.darkTheme.colors.info).toBe('#38BDF8')
    // normalizeColorMap idempotent: zaten normalize olan değeri değiştirmez.
    expect(normalizeColorMap(themes.lightTheme.colors).danger).toBe('#B91C1C')
    expect(normalizeColorMap(themes.darkTheme.colors).info).toBe('#38BDF8')
  })
})
