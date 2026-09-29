import { ref, markRaw, shallowRef, defineAsyncComponent } from 'vue'
import { defineStore } from 'pinia'
import useRestApi from '@/composables/restapi'
import { registerStoreReset } from '@/stores/resetRegistry'
import ClaimListView from '@/views/secure/ClaimListView.vue'


export const useMenuStore = defineStore('menu', () => {
  /*   export default function useMenuStore() { */
  /*   export const useMenuStore = defineStore('menu', () => { */

  const tabProcessedMenu: any = ref([])
  const favorites: any = ref([])

  const views = new Map<string, any>([
    ['DashboardView', shallowRef(defineAsyncComponent(() => import('@/views/secure/DashboardView.vue')))],
    ['adminPanel/AdminView', shallowRef(defineAsyncComponent(() => import('@/views/secure/adminPanel/AdminView.vue')))],
    ['adminPanel/AdminClientListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/adminPanel/AdminClientListView.vue')))],
    ['adminPanel/AdminTicketListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/adminPanel/AdminTicketListView.vue')))],
    ['adminPanel/AdminSystemManagementView', shallowRef(defineAsyncComponent(() => import('@/views/secure/adminPanel/AdminSystemManagementView.vue')))],
    // ADR-0020 Aşama C — entegrasyon/motor ayar yönetimi (`platformAdmin`). Gerçek menü ağacı kaydı
    // (ApplicationDB `menus`) bu görevin kapsamı dışı (bkz. `screens.ts` aynı satırdaki not); bileşen
    // eşlemesi burada olduğu için ekranlar `useOpenIntegrationConfigTab` ile (derin bağlantı/klonlama
    // deseni, `ProductListView.vue` `openEditProduct` ile AYNI) birbirine açılabilir.
    ['adminPanel/IntegrationConfigListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/adminPanel/integrations/IntegrationConfigListView.vue')))],
    ['adminPanel/IntegrationSettingsView', shallowRef(defineAsyncComponent(() => import('@/views/secure/adminPanel/integrations/IntegrationSettingsView.vue')))],
    ['adminPanel/EngineSettingsView', shallowRef(defineAsyncComponent(() => import('@/views/secure/adminPanel/integrations/EngineSettingsView.vue')))],
    ['adminPanel/EffectiveConfigView', shallowRef(defineAsyncComponent(() => import('@/views/secure/adminPanel/integrations/EffectiveConfigView.vue')))],

    ['productDefinitions/TEST', shallowRef(defineAsyncComponent(() => import('@/views/secure/productDefinitions/TEST.vue')))],

    ['OrderListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/OrderListView.vue')))],
    ['ClaimListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/ClaimListView.vue')))],
    ['CustomerListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/CustomerListView.vue')))],
    ['MessageListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/MessageListView.vue')))],
    ['FinancialListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/FinancialListView.vue')))],
    ['InvoiceListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/InvoiceListView.vue')))],
    ['PrintoutListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/PrintoutListView.vue')))],
    ['SettingListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/SettingListView.vue')))],
    ['LogListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/LogListView.vue')))],

    ['productDefinitions/ProductListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/productDefinitions/ProductListView.vue')))],
    ['productDefinitions/CategoryListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/productDefinitions/CategoryListView.vue')))],
    ['productDefinitions/BrandListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/productDefinitions/BrandListView.vue')))],
    ['productDefinitions/ChoiceListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/productDefinitions/ChoiceListView.vue')))],
    ['productDefinitions/HashtagListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/productDefinitions/HashtagListView.vue')))],

    ['ProductUpdateView', shallowRef(defineAsyncComponent(() => import('@/views/secure/definitions/ProductUpdateView.vue')))],

    ['definitions/OrderDefinitionView', shallowRef(defineAsyncComponent(() => import('@/views/secure/definitions/OrderDefinitionView.vue')))],
    ['definitions/ReturnDefinitionView', shallowRef(defineAsyncComponent(() => import('@/views/secure/definitions/ReturnDefinitionView.vue')))],
    ['definitions/CustomerDefinitionView', shallowRef(defineAsyncComponent(() => import('@/views/secure/definitions/CustomerDefinitionView.vue')))],
    ['definitions/InvoiceDefinitionView', shallowRef(defineAsyncComponent(() => import('@/views/secure/definitions/InvoiceDefinitionView.vue')))],
    ['definitions/ProductDefinitionView', shallowRef(defineAsyncComponent(() => import('@/views/secure/definitions/ProductDefinitionView.vue')))],
    ['definitions/CategoryDefinitionView', shallowRef(defineAsyncComponent(() => import('@/views/secure/definitions/CategoryDefinitionView.vue')))],
    ['definitions/BrandDefinitionView', shallowRef(defineAsyncComponent(() => import('@/views/secure/definitions/BrandDefinitionView.vue')))],
    ['definitions/OptionDefinitionView', shallowRef(defineAsyncComponent(() => import('@/views/secure/definitions/OptionDefinitionView.vue')))],
    ['definitions/HashtagDefinitionView', shallowRef(defineAsyncComponent(() => import('@/views/secure/definitions/HashtagDefinitionView.vue')))],

    ['integrations/MarketplaceView', shallowRef(defineAsyncComponent(() => import('@/views/secure/integrations/MarketplaceView.vue')))],
    ['integrations/ECommerceView', shallowRef(defineAsyncComponent(() => import('@/views/secure/integrations/ECommerceView.vue')))],
    ['integrations/ShippingView', shallowRef(defineAsyncComponent(() => import('@/views/secure/integrations/ShippingView.vue')))],
    ['integrations/EInvoiceView', shallowRef(defineAsyncComponent(() => import('@/views/secure/integrations/EInvoiceView.vue')))],
    ['integrations/ErpView', shallowRef(defineAsyncComponent(() => import('@/views/secure/integrations/ErpView.vue')))],


    ['supports/TicketListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/supports/TicketListView.vue')))],

    ['user/InvoiceInfoView', shallowRef(defineAsyncComponent(() => import('@/views/secure/user/InvoiceInfoView.vue')))],
    ['user/ChangePasswordView', shallowRef(defineAsyncComponent(() => import('@/views/secure/user/ChangePasswordView.vue')))],
    ['user/SubscriptionView', shallowRef(defineAsyncComponent(() => import('@/views/secure/user/SubscriptionView.vue')))],
    ['user/EducationView', shallowRef(defineAsyncComponent(() => import('@/views/secure/user/SubscriptionView.vue')))],
    ['user/ExitView', shallowRef(defineAsyncComponent(() => import('@/views/secure/user/ExitView.vue')))],

    ['AuthorizationListView', shallowRef(defineAsyncComponent(() => import('@/views/secure/user/AuthorizationListView.vue')))],

    // ADR-0015 B4-P0 — yeni ekranlar (yalnızca EKLEME; `screens.ts` ile birebir anahtar). Gerçek menü ağacı kaydı
    // (ApplicationDB `menus`) bu bulut görevinin kapsamı dışı — ADR-0020 ekranlarıyla aynı emsal (yukarıda).
    ['AccountSecurityView', shallowRef(defineAsyncComponent(() => import('@/views/secure/user/AccountSecurityView.vue')))],

  ]);

  const restApi = useRestApi()
  const data = {
    "metadata": {
      "service": "retrieveMicroservices",
      "request": {
        "serviceName": "duyguServ11ice",
        "file": "file code1231"
      }
    }
  }



  const supportMenu: any = [
  ]

  const systemMenu: any = [
  ]


  const constantMenu = ref([])
  var initialized = false
  var version = ref(0)
  var leftMenu = ref(false)
  var menu: any = ref()

  const retrieveFavorites = async () => {
    const resp = await restApi.post("MenuService/retrieveFavorites", {})
    if (resp) {
      favorites.value = resp
      findByCodeInMenu("", true)
    }
    if (resp && resp.length > 0) {
      for (const favorite of favorites.value) {
        const temp = findByCodeInMenu(favorite.code)
        if (temp)
          temp.isFavorite = true
      }
    }
  }

  const addFavorite = async (code: string) => {
    const resp = await restApi.post("MenuService/addFavorite", { code: code })
    if (resp)
      retrieveFavorites()
  }

  const deleteFavorite = async (code: string) => {
    const resp = await restApi.post("MenuService/deleteFavorite", { code: code })
    if (resp)
      retrieveFavorites()
  }

  const sortFavorites = async (sortedCodes: any) => {
    const resp = await restApi.post("MenuService/sortFavorites", { sortedCodes: sortedCodes })
    if (resp)
      retrieveFavorites()
  }


  const findByCodeInMenu = (targetCode: any, reset = false) => {
    // Alt dizileri özyinelemeli olarak aramak için yardımcı bir fonksiyon
    const searchLinks = (links: any) => {
      for (const link of links) {
        //resetleme modunda
        if (reset == true) link.isFavorite = false
        // `code` alanını kontrol et
        if (link.code === targetCode) {
          return link;
        }
        // `children` varsa, içinde de arama yap
        if (link.children) {
          const foundInChildren: any = searchLinks(link.children);
          if (foundInChildren) {
            return foundInChildren;
          }
        }
      }
      return null;
    }

    // Ana `list` dizisi üzerinde aramayı başlat
    for (const group of menu.value) {
      const found = searchLinks(group.links);
      if (found) {
        return found;
      }
    }
    return null; // Eşleşen nesne bulunamazsa null döndür
  }

  const getFavorites = () => {
    const favoriteLinks = []
    for (const favorite of favorites.value) {
      const temp = findByCodeInMenu(favorite.code)
      if (temp)
        favoriteLinks.push(temp)
    }
    return favoriteLinks
  }



  const isFavorite = (code: string) => {
    const temp = favorites.value.find((item: any) => item.code === code)
    if (temp) {
      return true
    }
    return false
  }

  var init = async () => {
    if (initialized) return



    menu.value = await restApi.get("MenuService")

    createConstantMenu(constantMenu.value)

    if (menu.value && menu.value.length > 0) {

      /*       menu.value[1].links.push((<any>menu).value[2].links[0].children[0])
      
            menu.value[1].links.push((<any>menu).value[2].links[0].children[1])
            menu.value[1].links.push((<any>menu).value[2].links[0].children[2])
            menu.value[1].links.push((<any>menu).value[2].links[0].children[3])
            menu.value[1].links.push((<any>menu).value[2].links[0].children[4])
            menu.value[1].links.push((<any>menu).value[2].links[0].children[5])
            menu.value[1].links.push((<any>menu).value[2].links[4])
            menu.value[1].links.push((<any>menu).value[4].links[4])
            menu.value[1].links.push((<any>menu).value[4].links[3])
            menu.value[1].links.push((<any>menu).value[4].links[5])
       */

      var a = 1
      var tempId = 100
      var processMenu = (parent: any, links: any) => {
        links.forEach((menuLink: any) => {
          menuLink.fullPath = parent + '.' + menuLink.title
          if (menuLink.parent == "")
            menuLink.component = views.get(menuLink.code)
          else
            menuLink.component = views.get(menuLink.parent + '/' + menuLink.code)
          menuLink.id = tempId++
          if (menuLink.children) {
            processMenu(menuLink.fullPath, menuLink.children)
            menuLink.fullPath += '.' + menuLink.title
          }
        });
      }


      menu.value.forEach((menuGroup: any) => {
        processMenu('menu', menuGroup.links)
      })


      var tabProcessMenu = (links: any) => {
        links.forEach((menuLink: any) => {
          if (menuLink.children) {
            tabProcessMenu(menuLink.children)
          } else {
            tabProcessedMenu.value.push(menuLink)
          }
        });
      }
      menu.value.forEach((menuGroup: any) => {
        if (menuGroup.group != 'favorites')
          tabProcessMenu(menuGroup.links)
      })



      supportMenu.push(getMenuLinkWithTitle('ticketDefinition'))
      supportMenu.push(getMenuLinkWithTitle('ticketList'))
      supportMenu.push(getMenuLinkWithTitle('educationCenter'))

      systemMenu.push(getMenuLinkWithTitle('subscription'))
      systemMenu.push(getMenuLinkWithTitle('changePassword'))
      systemMenu.push(getMenuLinkWithTitle('exit'))


      initialized = true
    }

  }
  var toggleLeftMenu = () => {
    leftMenu.value = !leftMenu.value
  }
  var getLeftMenu = () => {
    return leftMenu.value
  }





  var createNewMenuVersion = () => {
    version.value++
  }
  var getMenuLinkWithTitle = (title: string) => {
    if (menu.value == undefined) return undefined
    for (let menuGroup of menu.value) {
      let tempLink: any = retrieveMenuLinkWithTitle(title, menuGroup.links)
      if (tempLink != undefined) return tempLink
    }
    return undefined
  }

  var retrieveMenuLinkWithTitle = (title: string, links: any) => {
    if (!Array.isArray(links)) return undefined
    let tempLink = links.find((obj: any) => obj["title"] == title)
    if (tempLink != undefined)
      return tempLink
    else {
      let tempLink: any = undefined
      for (let link of links) {
        if (link.children)
          tempLink = retrieveMenuLinkWithTitle(title, link.children)
        if (tempLink != undefined) return tempLink
      }
    }
    return undefined
  }


  var getMenuLinkWithCode = (code: string) => {
    if (menu.value == undefined) return undefined
    for (let menuGroup of menu.value) {
      // 1. Try search by Code
      let tempLink: any = retrieveMenuLinkWithCode(code, menuGroup.links)
      if (tempLink != undefined) return tempLink

      // 2. Fallback to search by Title (for compatibility with existing components)
      tempLink = retrieveMenuLinkWithTitle(code, menuGroup.links)
      if (tempLink != undefined) return tempLink
    }
    return undefined
  }

  var retrieveMenuLinkWithCode = (code: string, links: any) => {
    if (!Array.isArray(links)) return undefined
    let tempLink = links.find((obj: any) => obj["code"] == code)
    if (tempLink != undefined)
      return tempLink
    else {
      let tempLink: any = undefined
      for (let link of links) {
        if (link.children)
          tempLink = retrieveMenuLinkWithCode(code, link.children)
        if (tempLink != undefined) return tempLink
      }
    }
    return undefined
  }



  var getMenuLink = (id: number) => {
    for (let menuGroup of menu.value) {
      let tempLink: any = retrieveMenuLink(id, menuGroup.links)
      if (tempLink != undefined) return tempLink
    }
    return undefined
  }
  var retrieveMenuLink = (id: number, links: any) => {
    let tempLink = links.find((obj: any) => obj["id"] == id)
    if (tempLink != undefined)
      return tempLink
    else {
      let tempLink: any = undefined
      for (let link of links) {
        if (link.children)
          tempLink = retrieveMenuLink(id, link.children)
        if (tempLink != undefined) return tempLink
      }
    }
    return undefined
  }




  function getMenu() {
    return menu.value
  }




  const createConstantMenu = (constantMenu: Array<any>) => {
    // Alt dizileri özyinelemeli olarak aramak için yardımcı bir fonksiyon
    const searchLinks = (links: any) => {
      for (const link of links) {
        // `code` alanını kontrol et
        if (link.isConstant) {
          constantMenu.push(link)
        }
        // `children` varsa, içinde de arama yap
        if (link.children) {
          searchLinks(link.children);
        }
      }
      return null;
    }

    // Ana `list` dizisi üzerinde aramayı başlat
    for (const group of menu.value) {
      searchLinks(group.links);
      constantMenu.sort((a: any, b: any) => a.isConstant - b.isConstant)
    }
  }
  var getFavoriteLinks = () => {
    return constantMenu.value
  }

  var isFavoriteLink = (link: any) => {
    /*     if (getFavoriteLinks().includes(link)) return true */
    return false
  }

  var addFavoriteLink = (link: any) => {
    /*     if (!isFavoriteLink(link))
          getFavoriteLinks().push(link) */
  }

  var deleteFavoriteLink = (link: any) => {
    const index = getFavoriteLinks().findIndex((item: any) => item.id === link.id);

    if (index !== -1) {
      getFavoriteLinks().splice(index, 1);
      createNewMenuVersion()
    }
  }

  const getComponent = () => {

  }

  /*   init() */


  // R9b / H-01: `init` bir kez çalıştığı için (`initialized` bayrağı) çıkış sonrası başka hesapla girişte önceki
  // kullanıcının menüsü kalıyordu. Kimliğe bağlı tüm menü durumu sıfırlanır; `views` (bileşen haritası) sabittir.
  registerStoreReset('menu', () => {
    menu.value = undefined
    initialized = false
    tabProcessedMenu.value = []
    favorites.value = []
    constantMenu.value = []
    supportMenu.length = 0
    systemMenu.length = 0
    leftMenu.value = false
    version.value = 0
  })

  const getViewComponent = (code: string) => {
    if (views.has(code)) {
      return views.get(code)
    }
  }

  return {
    init,
    version,
    getMenu,
    getMenuLink,
    getMenuLinkWithTitle,
    getMenuLinkWithCode,
    systemMenu,
    supportMenu,
    tabProcessedMenu,
    getFavoriteLinks,
    isFavoriteLink,
    deleteFavoriteLink,
    addFavoriteLink,
    toggleLeftMenu,
    getLeftMenu,
    retrieveFavorites,
    getFavorites,
    isFavorite,
    addFavorite,
    deleteFavorite,
    sortFavorites,
    getViewComponent
  }
})