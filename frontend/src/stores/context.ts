import { reactive } from 'vue'

/**
 * R9b / H-01 (docs/FRONTEND_CODE_AUDIT.md): bu dosya eskiden GERÇEK bir müşterinin adını/logosunu
 * ("DALZİ AYAKKABI ÇANTA İTH. İHR. LTD. ŞTİ", `dalzi-…png`) sabit kodluyordu — çok kiracılı SaaS'ta
 * TÜM kiracılara aynı (başka bir müşteriye ait) kimlik gösteriliyordu (ticari/KVKK riski).
 *
 * Gerçek mağaza adı/logosu zaten `composables/user.ts` (`useUser().getStoreName()` /
 * `getStoreLogo()`, kaynak: `SettingService/getSettings`) üzerinden geliyor —
 * `components/layout/ApplicationBar.vue` ve `NavigationMenu.vue` artık DOĞRUDAN onu kullanıyor
 * (bkz. `StoreLogoAvatar.vue`: logo yoksa nötr monogram, asla sabit/başka bir kiracının görseli).
 *
 * Bu store'un `site`/`user` alanları hiçbir yerden okunmuyor (yalnızca `views/secure/definitions/
 * CategoryDefinitionView.vue` ve `productDefinitions/CategoryListView.vue` `inject('useContextStore')`
 * yapıp hiç kullanmıyor) — kaldırılmadı (dosyaya `dokunulmayacak dizin` kısıtı yok ama gereksiz geniş
 * bir değişiklik olurdu), yalnızca sabit kimlik verisi kaldırıldı.
 */
export default function useContextStore(eventBus: any) {
  const openLink = (link: any) => {
    eventBus.emit('openTab', link)
  }

  const site = reactive({
    name: '',
    logo: '',
  })
  const user = reactive({
    name: '',
    logo: '',
  })

  function getUser() {
    return user
  }

  function getSite() {
    return site
  }

  function init() {
    // Bilerek boş: gerçek tenant kimliği artık `useUser()` üzerinden okunuyor (bkz. dosya başı notu).
  }

  init()
  return { init, getUser, getSite, openLink }
}
