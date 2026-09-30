/**
 * frontend/src/help/pageHelpLookup.ts — sekme/menü kodundan "Sayfa hakkında" içeriği. Makale içeriğini YÜKLEMEZ
 * (EkPageBar her sayfada kullanılır; makaleler yalnız yardım merkezi/arama açılınca yüklenir).
 */
import { PAGE_HELP } from './pageHelp'
import type { PageHelp } from './types'

/**
 * Sekme/menü kodundan sayfa yardımı. Kabul edilen biçimler: tam views anahtarı (`productDefinitions/ProductListView`),
 * yalnız kod (`ProductListView`) ve klon sekme kodu (`ProductUpdateView_<id>`, `IntegrationSettingsView_trendyol`).
 */
export function pageHelpFor(codeOrKey: string | undefined | null): (PageHelp & { key: string }) | undefined {
  if (!codeOrKey) return undefined
  const raw = String(codeOrKey)
  if (PAGE_HELP[raw]) return { ...PAGE_HELP[raw], key: raw }
  const code = raw.split('/').pop() ?? raw
  const candidates = [code, code.replace(/_.*$/, '')]
  for (const c of candidates) {
    const key = Object.keys(PAGE_HELP).find((k) => k === c || k.split('/').pop() === c)
    if (key) return { ...PAGE_HELP[key], key }
  }
  return undefined
}

