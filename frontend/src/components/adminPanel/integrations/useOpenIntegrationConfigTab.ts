// frontend/src/components/adminPanel/integrations/useOpenIntegrationConfigTab.ts
//
// ADR-0020 Aşama C — bu 4 ekran (Entegrasyonlar/Entegrasyon Ayarları/Motor Ayarları/Etkin
// Yapılandırma) arasında geçiş. GERÇEK menü kaydı (ApplicationDB `menus`, platformAdmin grubu)
// bu görevin kapsamı DIŞINDADIR (backend/DB'ye dokunulmaz) — bu yüzden `menuStore.getMenuLinkWithTitle`
// (backend'den yüklenen menü ağacına bağımlı, bkz. `ProductListView.vue` `openProductDefinition`)
// KULLANILMAZ. Bunun yerine `ProductUpdateView` derin-bağlantı KLONLAMA deseni birebir izlenir
// (`ProductListView.vue` `openEditProduct`: elle kurulan `link` + `menuStore.getViewComponent(key)` +
// `eventBus.emit('openTab', link)`, `workspace.ts` `openTab(link)` ile AYNI sözleşme). Ekranlar
// `screens.ts`/`menu.ts`'e kayıtlı OLDUĞU için `component` her zaman çözülür; yalnızca backend menü
// AĞACINDA (sidebar) görünmüyorlar — bu BACKLOG'a yazıldı (bkz. görev raporu).
import { inject } from 'vue'
import { useMenuStore } from '@/stores/site/menu'

export type IntegrationConfigViewName =
  | 'IntegrationConfigListView'
  | 'IntegrationSettingsView'
  | 'EngineSettingsView'
  | 'EffectiveConfigView'

const VIEW_TITLES: Record<IntegrationConfigViewName, string> = {
  IntegrationConfigListView: 'Entegrasyonlar',
  IntegrationSettingsView: 'Entegrasyon Ayarları',
  EngineSettingsView: 'Motor Ayarları',
  EffectiveConfigView: 'Etkin Yapılandırma',
}

export function useOpenIntegrationConfigTab() {
  const eventBus: any = inject('eventBus')
  const menuStore: any = useMenuStore()

  /** `parameters.code` verilirse örnek başına ayrı bir sekme açılır (ürün düzenleme deseniyle AYNI). */
  return function openIntegrationConfigTab(view: IntegrationConfigViewName, parameters?: Record<string, any>): boolean {
    const key = `adminPanel/${view}`
    const component = menuStore.getViewComponent(key)
    if (!component || !eventBus) return false

    const code = parameters?.code
    const suffix = code ? `_${code}` : ''
    const title = code ? `${VIEW_TITLES[view]} — ${String(code)}` : VIEW_TITLES[view]
    const link: any = {
      code: `${view}${suffix}`,
      parent: 'adminPanel',
      title,
      // BİLİNÇLİ OLARAK HER ZAMAN false (araştırma bulgusu, bu görevde bulundu): `SecureLayout.vue`
      // sekme çubuğu `singleton !== false` olan sekmeler için başlığı `$t(link.fullPath)` ile
      // çözüyor (i18n anahtarı, backend menüsünden gelir) — bizim elle kurduğumuz `link`'te
      // `fullPath` YOK, `$t(undefined)` vue-i18n mesaj derleyicisinde "Invalid arguments" hatasıyla
      // ÇÖKÜYORDU (Vue hata sınırı yakalıyor, kullanıcı sessizce panoya düşüyordu). `singleton:false`
      // her zaman `link.title` (düz metin) kullanır — `ProductUpdateView` klonlama deseniyle AYNI
      // (bkz. dosya başı notu). Sekme tekilleştirmesi `link.code` eşleşmesiyle çalışır (workspace.ts
      // `openTab`), `singleton` alanına bağımlı DEĞİLDİR — bu yüzden tekrar tıklamada AYNI sekmeye
      // dönülmesi (Motor Ayarları gibi tek-örnekli ekranlarda istenen davranış) korunur.
      singleton: false,
      component,
      parameters,
    }
    eventBus.emit('openTab', link)
    return true
  }
}
