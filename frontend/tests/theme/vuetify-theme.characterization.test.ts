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
 * **DS-v2 Aşama 1 (2026-09-29) — ikinci bilinçli yeniden tabanlama:** tema
 * `tokens/workspace.ts` uygulama profilinden beslenir (47 yeni rol anahtarı +
 * paylaşılan/legacy anahtarların uygulama değerleri DS-v2'ye eşlendi; site
 * profili değişmedi). Ayrıntı: `theme-snapshot.baseline.json` `_meta`,
 * `frontend/DESIGN_SYSTEM.md`.
 *
 * **ADR-0026 Aşama 0 (2026-09-30):** tema artık `@entegrasyonik/ui/theme` paketinden gelir (backoffice ile TEK
 * kaynak); light taban AYNEN korundu, dark taban paketin TAM dark temasıdır (müşteri uygulamasında dark kapısı kapalı).
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

  it('lightTheme 119 anahtar üretir (DS-v2: 75 semantik [13 çekirdek + 15 ADR-0015 + 47 DS-v2] + 43 legacy anahtarın TAMAMI + Vuetify\'ın override edilmeyen tek çekirdek varsayılanı "on-surface-variant")', async () => {
    const { lightTheme } = await loadNormalizedThemes()
    expect(Object.keys(lightTheme)).toHaveLength(119)
  })

  it('darkTheme 119 anahtar üretir (ADR-0026: paketin TAM dark teması — light ile AYNI anahtar kümesi: 75 semantik + 43 legacy [rol eşlemesinden] + "on-surface-variant")', async () => {
    const { darkTheme } = await loadNormalizedThemes()
    expect(Object.keys(darkTheme)).toHaveLength(119)
  })

  it('ADR-0026: darkTheme anahtar kümesi lightTheme ile birebir aynı (eski "alt küme" kırık kalıbı kapandı: koyu temaya geçildiğinde tanımsız anahtar kalmaz)', async () => {
    const { lightTheme, darkTheme } = await loadNormalizedThemes()
    expect(Object.keys(darkTheme).sort()).toEqual(Object.keys(lightTheme).sort())
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
