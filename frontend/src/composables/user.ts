import { ref, reactive, computed } from 'vue'
import useRestApi from '@/composables/restapi'
import { useMenuStore } from '@/stores/site/menu'
import { useBrandsStore } from '@/stores/brandsStore';
import { useChoicesStore } from '@/stores/choicesStore';
import { useHashtagsStore } from '@/stores/hashtagsStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
import { useIntegrationStore } from '@/stores/integrationStore';
import { registerStoreReset } from '@/stores/resetRegistry';

var userContext: any = ref({})
var resources: any = ref([])
var settings: any = ref({})
var stores: any = ref([]) // Süper Yönetici için mağaza listesi
const productStatistics: any = ref()
const activeClientId: any = ref(0)

// R9b / H-01: modül-düzeyi oturum durumu (Pinia dışı) da giriş ekranında sıfırlanır — açık çıkışta yalnızca 3 ref
// temizleniyor, oturum süresi dolması yönlendirmesinde hiçbiri temizlenmiyordu.
registerStoreReset('userSession', () => {
  userContext.value = null
  resources.value = []
  settings.value = {}
  stores.value = []
  productStatistics.value = undefined
  activeClientId.value = 0
})

export default function useUser() {
  const hashtagsStore = useHashtagsStore()
  const choicesStore = useChoicesStore()
  const brandsStore = useBrandsStore()
  const categoriesStore = useCategoriesStore()
  const menuStore: any = useMenuStore()
  const integrationStore: any = useIntegrationStore()

  const restApi = useRestApi()
  const login = async (username: string, password: string) => {
    const resp: any = await restApi.post('SecurityService/login', { username, password })

    if (resp?.requireStoreSelection) {
      stores.value = resp.clients
      userContext.value = resp.user
      return resp
    }

    if (resp && resp._id) {
      userContext.value = resp
      await fetchUserContext()
    }
    return resp
  }

  const selectStore = async (clientId: number) => {
    const resp: any = await restApi.post('SecurityService/selectStore', { clientId })
    // ADR-0001 adım 6: sunucu yeni oturumu Set-Cookie ile yazar; yanıt gövdesi { store, user } (token DÖNMEZ).
    // restApi.post hata durumunda axios hata nesnesini çözümlediği için (truthy) başarı gövde şekline göre doğrulanır.
    if (resp && resp.store && resp.user) {
      userContext.value = resp.user
      activeClientId.value = resp.store.clientId
      // Çerez yenilendiği için context'i tazele
      await fetchUserContext()
      return true
    }
    return false
  }

  const register = async (registerValues: any) => {
    const resp: any = await restApi.post('SecurityService/register', { registerValues })
    // ADR-0014 S4b: başarı bilgisi çağırana döner (kayıt sonrası yönlendirme için). Hata-yutma davranışı DEĞİŞMEDİ:
    // başarısızlıkta hiçbir şey fırlatılmaz/gösterilmez, yalnızca `false` döner.
    if (resp && resp._id) {
      userContext.value = resp
      await fetchUserContext()
      return true
    }
    return false
  }

  // ADR-0015 Karar 2/Karar 4 + `docs/API_ACCOUNT_LIFECYCLE.md` #2/#3 — kimliksiz (özel) uçlar.
  // `restApi.post` hata durumunda axios hata NESNESİNİ (reject etmeden) `resolve` eder (bkz. restapi.ts);
  // çağıran taraf başarıyı `resp.success === true` ile, hatayı `resp.response.status` ile ayırt eder.
  // Backend numaralandırma yapmadığı için (kullanıcı var/yok ayrımı YOK) burada da EK bir ayrım YAPILMAZ.
  const requestPasswordReset = async (email: string) => {
    return await restApi.post('AccountService/requestPasswordReset', { email })
  }

  const confirmPasswordReset = async (token: string, newPassword: string) => {
    return await restApi.post('AccountService/confirmPasswordReset', { token, newPassword })
  }


  const logout = async () => {
    try {
      await restApi.post('SecurityService/logout', {})
    } catch (e) {
      console.error("Logout hatası:", e)
    } finally {
      // 1. Context'i ve kaynakları temizle
      userContext.value = null
      resources.value = []
      settings.value = {}

      // 2. Diğer store'ları sıfırla (Opsiyonel ama temizlik için iyidir)
      // brandsStore.$reset() vb. kullanabilirsin

      return true
    }
  }


  const isAuthenticated = async (mode: boolean = true) => {
    try {
      const resp: any = await restApi.get('checkAuthentication', mode)
      return resp == true
    } catch (e) {
    }
    return false
  }


  const retrieveSettings = async () => {
    let response = await restApi.post("SettingService/getSettings", {})
    if (response?.settings) {
      settings.value = response.settings
    }
  }



  const initApp = async () => {
    //retrieveConfiguration()
    retrieveResources()
    retrieveSettings()
    retrieveProductStatistics()

    integrationStore.clientInit()
    await menuStore.init()
    menuStore.retrieveFavorites()
    categoriesStore.retrieve()
    brandsStore.retrieve()
    choicesStore.retrieve()
    hashtagsStore.retrieve()
  }


  const retrieveConfiguration = async () => {
    const resp: any = await restApi.get('ConfigurationService')
    resources.value = resp
    return resp
  }


  const retrieveProductStatistics = async () => {
    productStatistics.value = await restApi.post("ProductService/getProductStatistics", {})
  }


  const getRoles = async () => {
    return await restApi.post('UserService/getRoles', {})
  }

  const retrieveResources = async () => {
    const resp: any = await restApi.post('UserService/getResources', {})
    resources.value = resp
    return resp
  }

  const getStoreName = () => {
    return settings.value.storeName
  }

  /**
   * R9b / H-01: gerçek tenant logosu (varsa) — `SettingListView` `settings.logo` ile AYNI kaynak
   * (`SettingService/getSettings`). Boşsa çağıran taraf nötr bir monogram göstermelidir (ADR-0015
   * kararı) — asla sabit/başka bir müşteriye ait bir görsele düşülmez.
   */
  const getStoreLogo = () => {
    return settings.value.logo
  }

  const getResources = () => {
    return resources.value
    /*     const root: any = []
        const map = new Map()
        let order = 1
        resources.value.forEach((item: any) => {
          const parts = item.code.split('.')
          const key = parts.join('.')
          const node = {
            id: order++,
            title: item.name,
            children: [],
            code: item.code,
          }
          map.set(key, node)
        })
    
        resources.value.forEach((item: any) => {
          const parts = item.code.split('.')
          if (parts.length === 1) {
            root.push(map.get(item.code))
          } else {
            const parentKey = parts.slice(0, -1).join('.')
            const parentNode = map.get(parentKey)
            if (parentNode) {
              parentNode.children.push(map.get(item.code))
            } else {
              root.push(map.get(item.code))
            }
          }
        })
    
        function clean(node: any) {
          if (node.children.length === 0) delete node.children
          else node.children.forEach(clean)
        }
        root.forEach(clean)
    
        return root */
  }




  const fetchUserContext = async () => {
    const resp: any = await restApi.get('userContext')
    userContext.value = resp
    if (resp && resp.response && resp.response.status == 401) {
    } else {
      await initApp()
    }
    return resp
  }

  const getUsername = computed(() => {
    if (userContext.value)
      return userContext.value.username
    return undefined
  })

  // C2.4: kullanıcı/mağaza kapsamlı yerel kayıtlar için KİMLİK (e-posta/ad değil). Mağaza: süper-yönetici
  // seçimi (`activeClientId`) öncelikli, yoksa oturumun kendi `clientId`'si (profileDto beyaz listesi).
  const getSessionScope = computed(() => ({
    userId: userContext.value?._id as string | undefined,
    tenantId: (activeClientId.value || userContext.value?.clientId) as string | number | undefined,
  }))


  const checkAuthorization = (resource: string) => {
    if (userContext.value.owner == true) return false
    if (userContext.value?.resources) {
      if (userContext.value.resources.includes(resource)) {
        return true
      } else {
        return false
      }
    }
  }

  const getProductStatistics = () => {
    return productStatistics.value
  }

  const isOwner = () => {
    return userContext.value?.owner
  }

  // ADR-0020 Aşama C — admin panel (Entegrasyon Ayarları) ekranları, `platformAdmin`
  // dikeyinin İSTEMCİ tarafı görünürlük ipucudur (savunma derinliği; ASIL yetki sınırı
  // backend'de `principal.ga === true`, bkz. `operationPolicy.ts` `resolveTier`).
  // `profileDto.ts` beyaz listesi `isGlobalAdmin` alanını döner (`toProfileDto`, PROFILE_FIELDS).
  const isPlatformAdmin = () => {
    return userContext.value?.isGlobalAdmin === true
  }

  // Tenant `admin` kademesi (mağaza sahibi, ROLE_ADMIN/ROLE_OWNER rolü veya platform yöneticisi) — yalnızca
  // GÖRÜNÜRLÜK ipucu; asıl yetki sınırı backend `operationPolicy.resolveTier` (ADMIN_ROLE_CODES ile aynı küme).
  const isTenantAdmin = () => {
    const uc = userContext.value
    return uc?.owner === true || uc?.isGlobalAdmin === true || ['ROLE_ADMIN', 'ROLE_OWNER'].includes(uc?.roleCode)
  }

  return {
    getRoles,
    selectStore,
    stores,
    activeClientId,
    isOwner,
    isPlatformAdmin,
    isTenantAdmin,
    getStoreName,
    getStoreLogo,
    getResources,
    checkAuthorization,
    fetchUserContext,
    register,
    login,
    logout,
    requestPasswordReset,
    confirmPasswordReset,
    isAuthenticated,
    getUsername,
    getSessionScope,
    getProductStatistics,
    retrieveProductStatistics
  }
}