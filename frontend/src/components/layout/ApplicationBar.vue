<template>
  <v-app-bar color="surface" elevation="0" height="56" class="pa-0 ma-0 app-bar-border"
    style="width:auto; right:1px;">
    <LoadingComponent attach=".AppView" ref="loadingComponentRef" />

    <!-- ADR-0015 Karar 2.1 — masaüstünde kenar menü KALICI (hamburger'a gerek yok); tablet/mobilde
         geçici çekmece/üst katmanı açan tek düğme burada. Marka işareti her zaman görünür (Ek A
         `getByRole('img',{name:'Entegrasyonik'})` kancası, ADR Karar 5.1 izinli değişiklik 1). -->
    <button v-if="!isDesktop" type="button" class="d-flex align-center justify-center menu-toggle-btn ml-2"
      aria-label="Menüyü aç" @click="$emit('open-menu')">
      <v-icon size="22">mdi-menu</v-icon>
    </button>
    <div class="d-flex align-center pa-1 ml-2 flex-shrink-0" style="height:51px;">
      <EkBrandLogo :variant="isDesktop ? 'full' : 'mark'" :size="26" />
    </div>

    <v-spacer />

    <v-menu v-model="searchMenu" :close-on-content-click="false" location="bottom start" offset="5" max-height="500">
      <template v-slot:activator="{ props }">
        <v-text-field v-if="!isMobile" v-model="searchText" rounded="true" variant="outlined"
          density="compact" v-ripple.stop id="tour-homepage-smartsearch" v-bind="props" @click.stop="1" bg-color="white"
          style="min-width:300px!important; " class="customTextField pa-0 ma-0" :placeholder="$t('common.smartsearch')"
          hide-details autocomplete="off">
          <template #append-inner>
            <!--             <v-progress-circular v-if="searchLoading" indeterminate size="20" width="2" color="primary"
              class="mr-2"></v-progress-circular> -->
            <v-icon size="30" color="primary">mdi-magnify</v-icon>
          </template>
        </v-text-field>
      </template>

      <v-card v-if="hasResults || searchLoading" class="rounded-lg shadow-xl border overflow-hidden" min-width="400">
        <v-list density="compact" class="pa-0 search-result-list">
          <!-- Navigation Results -->
          <template v-if="searchResults.navigation.length > 0">
            <v-list-subheader class="text-overline font-weight-black color-slate-500 bg-slate-50 py-0"
              style="height: 28px !important;">Navigasyon</v-list-subheader>
            <v-list-item v-for="item in searchResults.navigation" :key="'nav-' + item.code"
              @click="handleSearchSelect('navigation', item)" class="py-1">
              <template #prepend>
                <v-icon color="primary" size="20">{{ item.link?.icon || 'mdi-compass-outline' }}</v-icon>
              </template>
              <v-list-item-title class="font-weight-medium text-body-2">{{ item.fullPath ? $t(item.fullPath) :
                item.title }}</v-list-item-title>
            </v-list-item>
            <v-divider />
          </template>

          <!-- Order Results -->
          <template v-if="searchResults.orders.length > 0">
            <v-list-subheader class="text-overline font-weight-black color-slate-500 bg-slate-50 py-0"
              style="height: 28px !important;">Siparişler</v-list-subheader>
            <v-list-item v-for="order in searchResults.orders" :key="'order-' + order._id"
              @click="handleSearchSelect('order', order)" class="py-2"
              style="border-bottom:1px solid rgb(var(--v-theme-borderColorLight))">
              <template #prepend>
                <v-icon color="indigo" size="20">mdi-package-variant-closed</v-icon>
              </template>
              <v-list-item-title class="font-weight-bold text-body-2">{{ order.orderNumber }}</v-list-item-title>
              <v-list-item-subtitle class="text-micro">{{ order.billingAddress?.firstName }} {{
                order.billingAddress?.lastName }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider />
          </template>
          <!-- Product Results -->
          <template v-if="searchResults.products.length > 0">
            <v-list-subheader class="text-overline font-weight-black color-slate-500 bg-slate-50 py-0"
              style="height: 28px !important;">Ürünler</v-list-subheader>
            <v-list-item v-for="product in searchResults.products" :key="'product-' + product._id"
              @click="handleSearchSelect('product', product)" class="py-2 search-item-premium">
              <template #prepend>
                <div class="product-image-container mr-3">
                  <v-img v-if="product.image" :src="product.image" cover class="rounded-lg shadow-sm" width="44"
                    height="44" />
                  <div v-else class="image-placeholder rounded-lg bg-slate-100 d-flex align-center justify-center"
                    style="width:44px; height:44px">
                    <v-icon color="slate-300" size="20">mdi-image-off-outline</v-icon>
                  </div>
                </div>
              </template>
              <div class="d-flex flex-column" style="gap: 1px">
                <v-list-item-title class="font-weight-black text-body-2 color-slate-900">{{ product.title
                  }}</v-list-item-title>
                <div class="d-flex align-center gap-2">
                  <span class="text-micro font-weight-bold color-slate-500">{{ product.brand || 'Markasız' }}</span>
                  <div class="mini-bullet"></div>
                  <span class="text-micro font-weight-black text-success">{{ formatCurrency(product.price || 0)
                  }}</span>
                </div>
              </div>
              <template #append>
                <div class="d-flex flex-column align-end">
                  <v-chip size="x-small" variant="tonal" :color="product.stock > 10 ? 'success' : 'warning'"
                    class="font-weight-black text-micro px-1">
                    {{ product.stock }} Stok
                  </v-chip>
                </div>
              </template>
            </v-list-item>
            <v-divider />
          </template>
          <!-- Customer Results -->
          <template v-if="searchResults.customers.length > 0">
            <v-list-subheader class="text-overline font-weight-black color-slate-500 bg-slate-50 py-0"
              style="height: 28px !important;">Müşteriler</v-list-subheader>
            <v-list-item v-for="customer in searchResults.customers" :key="'customer-' + customer._id"
              @click="handleSearchSelect('customer', customer)" class="py-2"
              style="border-bottom:1px solid rgb(var(--v-theme-borderColorLight))">
              <template #prepend>
                <v-avatar color="primaryLighten" size="32" class="mr-2 border-subtle">
                  <span class="text-micro font-weight-black text-white">
                    {{ customer.firstName?.[0] }}{{ customer.lastName?.[0] }}
                  </span>
                </v-avatar>
              </template>
              <v-list-item-title class="font-weight-bold text-body-2">{{ customer.firstName }} {{
                customer.lastName }}</v-list-item-title>
              <v-list-item-subtitle class="text-micro">{{ customer.phone }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider />
          </template>

          <!-- Claim Results -->
          <template v-if="searchResults.claims.length > 0">
            <v-list-subheader class="text-overline font-weight-black color-slate-500 bg-slate-50 py-0"
              style="height: 28px !important;">İadeler & Talepler</v-list-subheader>
            <v-list-item v-for="claim in searchResults.claims" :key="'claim-' + claim._id"
              @click="handleSearchSelect('claim', claim)" class="py-1">
              <template #prepend>
                <v-icon color="error" size="20">mdi-alert-circle-outline</v-icon>
              </template>
              <v-list-item-title class="font-weight-bold text-body-2">{{ claim.externalClaimId || claim.externalOrderId
              }}</v-list-item-title>
              <v-list-item-subtitle class="text-micro">
                {{ claim.customer?.firstName }} {{ claim.customer?.lastName }}
                <span class="ml-1 opacity-60">({{ claim.type }})</span>
              </v-list-item-subtitle>
            </v-list-item>
          </template>


          <!-- Empty State -->
          <div v-if="!searchLoading && !hasResults" class="pa-8 text-center">
            <v-icon size="48" color="slate-200">mdi-magnify-close</v-icon>
            <div class="text-subtitle-2 font-weight-bold color-slate-400 mt-2">Sonuç bulunamadı</div>
          </div>
        </v-list>
      </v-card>
    </v-menu>

    <!-- ADR-0015 Karar 2.5 — komut paleti tetikleyicisi (Ctrl/⌘ K). Mevcut "Akıllı Arama" alanına
         DOKUNULMADI (yukarıda, ayrı davranış); bu YALNIZCA gezinme filtresi açar. -->
    <button type="button" class="cmdk-trigger ml-2" aria-label="Komut paletini aç (Ctrl K)"
      @click="$emit('open-command-palette')">
      <v-icon size="16" class="mr-1">mdi-flash-outline</v-icon>
      <span v-if="isDesktop" class="cmdk-trigger__label">Git…</span>
      <span v-if="isDesktop" class="cmdk-trigger__kbd">Ctrl K</span>
    </button>

    <v-spacer v-if="!isMobile" />

    <div class="d-flex align-center pr-3" id="tour-homepage-topmenu">

      <v-menu v-if="isMobile" :close-on-content-click="false" location="bottom">
        <template v-slot:activator="{ props }">

          <v-btn v-bind="props" icon variant="text" class="nav-action-btn">
            <v-icon size="24">mdi-magnify</v-icon>
          </v-btn>


        </template>
        <v-card class="pa-2" min-width="250">
          <v-text-field autofocus density="compact" variant="outlined" hide-details
            :placeholder="$t('common.smartsearch')" append-inner-icon="mdi-magnify" />
        </v-card>
      </v-menu>

      <div class="d-flex align-center header-actions ml-auto">

        <v-btn icon variant="text" class="nav-action-btn" @click="notificationDrawer.toggleDrawer()">
          <v-badge color="error" :content="notificationDrawer.unreadCount"
            :model-value="notificationDrawer.unreadCount > 0" max="99" overlap offset-x="3" offset-y="3">
            <v-icon size="24">mdi-bell-outline</v-icon>
          </v-badge>
        </v-btn>


        <v-btn icon variant="text" class="nav-action-btn" @click="openTicketList()">
          <v-icon size="24">mdi-help</v-icon>
        </v-btn>

      </div>

      <v-menu scroll-strategy="close">
        <template v-slot:activator="{ props }">
          <div v-bind="props" class="d-flex align-center pa-1 pr-2 pl-2 pl-sm-4 mr-9 account-menu-trigger"
            role="button" tabindex="0" aria-label="Hesap menüsü">
            <StoreLogoAvatar :size="30" class="mr-0 mr-sm-2 account-avatar" :store-name="userApi.getStoreName()"
              :logo="userApi.getStoreLogo()" />

            <div class="text-truncate text-left d-none d-md-block">
              <div class="text-primary font-weight-medium">{{ userApi.getStoreName() }}</div>
            </div>

            <v-icon class="ml-1" size="25" color="rgb(var(--v-theme-passiveColor))">mdi-menu-down</v-icon>
          </div>
        </template>

        <v-list density="compact" nav class="pa-0" bg-color="cardComponentColor"
          style="border-radius:10px; border:1px solid rgb(var(--v-theme-borderColor)); border-top:none; min-width: 150px;">

          <v-list-item v-if="!isDesktop" class="bg-grey-lighten-4">
            <v-list-item-title class="text-primary font-weight-bold">
              {{ userApi.getStoreName() }}
            </v-list-item-title>
          </v-list-item>
          <v-divider v-if="!isDesktop" />

          <v-list-item @click="openSettings()" class="ma-0">
            <template #title>
              <v-icon size="25" class="mr-2" color="rgb(var(--v-theme-passiveColor))">mdi-cog</v-icon>
              <span class="font-weight-bold">Ayarlar</span>
            </template>
          </v-list-item>
          <v-divider />
          <v-list-item @click="logout()" class="ma-0">
            <template #title>
              <v-icon size="25" class="mr-2" color="rgb(var(--v-theme-passiveColor))">mdi-logout</v-icon>
              <span class="font-weight-bold">Çıkış</span>
            </template>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>
  </v-app-bar>
</template>

<script lang="ts" setup>
import { computed, watch, inject, ref, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { setI18nLanguage } from '@/plugins/i18n'
import { useNotificationDrawerStore } from '@/stores/notificationDrawer'
import useUser from '@/composables/user'
import useCommunication from '@/composables/site/communication'
import LoadingComponent from '../LoadingComponent.vue'
import StoreLogoAvatar from './StoreLogoAvatar.vue'
import useRestApi from '@/composables/restapi'
import { useDebounceFn } from '@vueuse/core'
import { useWorkspaceStore } from '@/stores/workspace'
import { useShellBreakpoints } from '@/composables/useShellBreakpoints'
import EkBrandLogo from '@/components/ds/EkBrandLogo.vue'

defineEmits<{ 'open-menu': []; 'open-command-palette': [] }>()

const eventBus: any = inject('eventBus')
const communication: any = useCommunication(eventBus)
const loadingComponentRef: any = ref(null)
const router = useRouter()
const userApi = useUser()
const restApi = useRestApi()
const workspace = useWorkspaceStore()

const menuStore: any = inject('useMenuStore')

const { locale, t } = useI18n({ useScope: 'global' })
const notificationDrawer = useNotificationDrawerStore()

// Vuetify'ın global display.thresholds'una DEĞİL, ADR-0011/ADR-0012 kırılım
// token'larına (breakpoint.tablet/desktop) bağlı yerel kırılım — ADR-0011
// Karar 1 "display.thresholds omurgada DEĞİŞMEZ" kararıyla tutarlı.
const { isMobile, isDesktop } = useShellBreakpoints()

const formatCurrency = (val: any) => {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(val)
}

const searchText = ref('')
const searchMenu = ref(false)
const searchLoading = ref(false)
const searchResults = reactive({
  navigation: [] as any[],
  orders: [] as any[],
  products: [] as any[],
  customers: [] as any[],
  claims: [] as any[]
})

const hasResults = computed(() => {
  return searchResults.navigation.length > 0 ||
    searchResults.orders.length > 0 ||
    searchResults.products.length > 0 ||
    searchResults.customers.length > 0 ||
    searchResults.claims.length > 0
})

const debouncedSearch = useDebounceFn(async () => {
  const query = searchText.value?.trim().toLowerCase()
  if (!query || query.length < 2) {
    searchMenu.value = false
    return
  }

  searchLoading.value = true
  searchMenu.value = true

  // 1. Navigation Search (Local)
  const menuItems = menuStore.getMenu() || []
  searchResults.navigation = menuItems.filter((item: any) =>
    (item.fullPath && t(item.fullPath).toLowerCase().includes(query)) ||
    item.title?.toLowerCase().includes(query)
  ).slice(0, 5)

  // 2. Parallel Entity Search (API)
  try {
    const response = await restApi.post('SmartService/unifiedSearch', { query })

    searchResults.orders = response?.orders || []
    searchResults.products = response?.products || []
    searchResults.customers = response?.customers || []
    searchResults.claims = response?.claims || []
  } catch (error) {
    console.error('Smart Search Error:', error)
  } finally {
    searchLoading.value = false
  }
}, 350)

const handleSearchSelect = (type: string, item: any) => {
  searchMenu.value = false
  searchText.value = ''


  let link = undefined
  if (type === 'navigation') {
    eventBus.emit('openTab', item)
  } else if (type === 'order') {
    link = menuStore.getMenuLinkWithTitle('orderList');
    link.parameters = { globalSearch: item.orderNumber }
  } else if (type === 'product') {
    link = menuStore.getMenuLinkWithTitle('productUpdate');
    link.parameters = { productId: item._id }
  } else if (type === 'customer') {
    link = menuStore.getMenuLinkWithTitle('customerList');
    link.parameters = { globalSearch: item.firstName + ' ' + item.lastName }
  } else if (type === 'claim') {
    link = menuStore.getMenuLinkWithTitle('claimList');
    link.parameters = { filter: { globalSearch: item.externalClaimId || item.externalOrderId } }
  }

  eventBus.emit('openTab', link)

}

const openSettings = () => eventBus.emit('openTab', menuStore.getMenuLinkWithTitle('settingList'))
const openTicketList = () => eventBus.emit('openTab', menuStore.getMenuLinkWithTitle('ticketList'))

const logout = async () => {
  const guid = loadingComponentRef.value.info("")
  await userApi.logout()
  // ADR-0012 Karar 3: açık çıkışta çalışma alanı persist anahtarı silinir (oturum süresi
  // dolması bunu SİLMEZ — yalnızca kullanıcının kendi isteğiyle çıkışı).
  workspace.clearPersist()
  router.push('/login')
  loadingComponentRef.value.remove(guid)
}

// ADR-0011 Karar 3: dark mode kapısı henüz açık DEĞİL — işlevsiz bir tema anahtarı
// GÖSTERİLMEZ (`darkMode` computed'ı ve `useThemeStore` inject'i bu yüzden kaldırıldı;
// zaten şablonda hiçbir yerde render EDİLMİYORDU — bkz. ADR-0011 T4a kapsamı).

watch(locale, (val) => setI18nLanguage(val))
watch(searchText, () => debouncedSearch())
</script>

<style scoped lang="scss">
.search-result-list {
  background: white;
  border-bottom: 1px solid rgb(var(--v-theme-borderColorLight));
}

.search-item-premium {
  transition: all var(--ek-duration-fast) var(--ek-easing-standard);
  border-bottom: 1px solid rgb(var(--v-theme-borderColorLight));
  margin-bottom: 4px;

  /* Ölü/yorum satırındaki hover varyantı token'a taşındı (ADR-0011 mandal — yorum içi
     literaller de sayılıyor): background-color: var(--ek-color-surface-muted); */
}

.product-image-container {
  transition: transform var(--ek-duration-fast) ease;
  flex-shrink: 0;
}

.mini-bullet {
  width: 3px;
  height: 3px;
  border-radius: var(--ek-radius-full);
  background-color: var(--ek-color-border-strong);
}

.gap-2 {
  gap: var(--ek-space-2);
}

.color-slate-900 {
  color: var(--ek-color-content-strong);
}

.color-slate-500 {
  color: var(--ek-color-content-muted);
}

.bg-slate-50 {
  background-color: var(--ek-color-surface-muted);
}

.border-subtle {
  border: 1px solid rgba(var(--v-theme-passiveColor), 0.1) !important;
}

.text-micro {
  font-size: 10px;
  line-height: 1.2;
}

.customTextField {
  :deep(.v-field__outline) {
    --v-field-border-opacity: 0.15;
  }

  :deep(.v-field--focused .v-field__outline) {
    --v-field-border-opacity: 1;
    color: rgb(var(--v-theme-primary));
  }
}
</style>


<style scoped>
/* Gereksiz kodlar temizlendi. */
.flex-shrink-0 {
  flex-shrink: 0;
}

.app-bar-border {
  border-bottom: 1px solid var(--ek-color-border-default);
}

.menu-toggle-btn {
  width: 36px;
  height: 36px;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-content-default);
}

.menu-toggle-btn:hover {
  background-color: var(--ek-color-surface-muted);
}

.menu-toggle-btn:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
}

.cmdk-trigger {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 10px;
  background: none;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  cursor: pointer;
  color: var(--ek-color-content-muted);
}

.cmdk-trigger:hover {
  background-color: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.cmdk-trigger:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
}

.cmdk-trigger__label {
  font-size: var(--ek-font-size-sm);
  margin-right: var(--ek-space-2);
}

.cmdk-trigger__kbd {
  font-size: var(--ek-font-size-xs);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-sm);
  padding: 0 4px;
}

.account-menu-trigger {
  cursor: pointer;
  border: 1px solid var(--ek-color-border-color);
  border-radius: var(--ek-radius-lg);
  background-color: var(--ek-color-surface-muted);
}

.account-menu-trigger:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
}

.account-avatar {
  border: 1px solid var(--ek-color-border-color);
}


.nav-action-btn {
  /* Diğer nav item'larınızın text rengi neyse onu kullanın, genelde hafif şeffaf beyaz/gri */
  color: rgba(var(--v-theme-passiveColor), 1) !important;
  width: 38px !important;
  height: 38px !important;
  margin: 0 2px;
  transition: all 0.2s ease !important;
  text-transform: none !important;
  letter-spacing: normal !important;
}

/* Hover durumunda nav item'lardaki standart 'active' veya 'hover' efektini taklit eder */
.nav-action-btn:hover {
  color: rgb(var(--v-theme-on-surface)) !important;
  background-color: rgba(var(--v-theme-on-surface), 0.08) !important;
  /* Eğer navigasyonunuzda aktif linkler hafifçe parlıyorsa buraya ekleyebiliriz */
}

/* Bildirim noktasını ikonla bütünleşik ve daha kibar hale getirdik */
.custom-dot :deep(.v-badge__badge) {
  width: 7px !important;
  height: 7px !important;
  min-width: 7px !important;
  border: 1.5px solid rgb(var(--v-theme-surface));
  /* Arka planla kaynaşmasını sağlar */
}

/* İkonların çok kaba durmaması için hafif inceltme hissi */
.v-icon {
  opacity: 0.85;
}

.nav-action-btn:hover .v-icon {
  opacity: 1;
}
</style>