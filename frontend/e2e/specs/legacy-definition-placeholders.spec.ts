// ADR-0015 B5-1 — Brand/Hashtag/Option/Customer/Invoice/Order/Return DefinitionView.
//
// ARAŞTIRMA BULGUSU (bu görevde tespit edildi, insan/orkestratör onayı önerilir — bkz. görev
// raporu): bu 7 ekran BAYT-BAYT (`CustomerDefinitionView.vue` hariç yalnızca ufak enjekte
// farklarıyla) AYNI koddur — kendi alanıyla (marka/etiket/seçenek/müşteri/fatura/sipariş/iade)
// HİÇBİR ilgisi olmayan, sabit kodlu bir "müşteri" tablosu (`customers.customer.*` i18n
// anahtarları, 6 satır sabit "Emre Yalçınkaya") render eder. Hiçbir gerçek API çağrısı yapmaz,
// hiçbir yerden (menüden/başka bir ekrandan) açılmaz (grep, 2026-09-29) — bitmemiş bir
// prototip/iskelet olduğu güçlü ölçüde görünüyor (bkz. ADR-0015 gap tablosu "§d ölü/prototip
// ekranlar" — normalde Aşama 0'da temizlenmesi beklenirdi). Bu B5-1 görevi kapsamında SİLİNMEDİ
// (Aşama 0 bu göreve ait değil, insan onayı gerektirir); yalnızca `EkPageHeader` + token tabanlı
// bir "kabuk" eklendi, ALTINDAKİ SAHTE İÇERİK DEĞİŞTİRİLMEDİ (davranış aynen korunur).
//
// Bu yüzden bu spec, ekranların GERÇEK (ve garip) bugünkü davranışını sabitler — "doğru"
// olduğu için değil, "böyle davrandığı" için (characterization-testing skill). Sentetik menü
// girişiyle açılır (`e2e/fixtures/definitionsMenu.ts`).
//
// ORTAM NOTU: ilk bulut oturumunda Chromium indirilemedi (`cdn.playwright.dev` 403) ve spec
// statik okumayla yazıldı. 2026-09-29 ikinci bulut oturumunda önceden kurulu Chromium ile
// ÇALIŞTIRILDI; ortaya çıkan seçici hataları ve görsel regresyon burada düzeltildi. Görsel
// onay yine yerelde (Windows tabanları) yapılır.
// FE-CFG-3 (ADR-0031, 2026-10-01): sahte müşteri tablosu (kişisel veri benzeri demo satırları) SİLİNDİ;
// ekranlar artık yalnız sayfa başlığı + boş durum render eder. Bu spec yeni davranışı kilitler.
import { test, expect } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed } from '../fixtures/nav'
import { HIDDEN_DEFINITION_SCREENS, menuFixtureWithLegacyDefinitions, openHiddenDefinitionScreen } from '../fixtures/definitionsMenu'

const cases = [
  { screen: HIDDEN_DEFINITION_SCREENS.BrandDefinitionView, title: 'Marka Tanımları' },
  { screen: HIDDEN_DEFINITION_SCREENS.HashtagDefinitionView, title: 'Etiket Tanımları' },
  { screen: HIDDEN_DEFINITION_SCREENS.OptionDefinitionView, title: 'Seçenek Tanımları' },
  { screen: HIDDEN_DEFINITION_SCREENS.CustomerDefinitionView, title: 'Müşteri Tanımları' },
  { screen: HIDDEN_DEFINITION_SCREENS.InvoiceDefinitionView, title: 'Fatura Tanımları' },
  { screen: HIDDEN_DEFINITION_SCREENS.OrderDefinitionView, title: 'Sipariş Tanımları' },
  { screen: HIDDEN_DEFINITION_SCREENS.ReturnDefinitionView, title: 'İade Tanımları' },
]

test.describe('B5-1 / FE-CFG-3 — Eski/prototip tanım ekranları (7 ekran, boş durum)', () => {
  for (const { screen, title } of cases) {
    test(`smoke: ${screen.code} açılır, başlık ("${title}") + boş durum; demo verisi yok`, async ({ page }) => {
      await installApiMocks(page, { MenuService: menuFixtureWithLegacyDefinitions })
      await gotoAuthed(page)
      await openHiddenDefinitionScreen(page, screen)

      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(page.getByText('Henüz kayıt yok')).toBeVisible()
      await expect(page.getByText('EMRE YALÇINKAYA')).toHaveCount(0)
      await expect(page.locator('.legacy-definition-root table')).toHaveCount(0)
    })
  }
})
