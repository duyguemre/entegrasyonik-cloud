<!--
  frontend/src/components/layout/WorkspaceTabHost.vue

  DS-v2 Aşama 6b — Standart 7. Bir çalışma alanı sekmesinin KABI: sekme içeriği + o sekmeden açılan tüm örtüler
  (diyalog, yan sayfa, alt sayfa, yükleme) burada yaşar. `provideTabScope` ile kabı alt ağaca verir; ds örtüleri
  (`useTabOverlay`) ve ham Vuetify `v-dialog` / `v-bottom-sheet` (aşağıdaki varsayılanlar) kaba bağlanır.
  Gizli sekmede kap `display:none` → örtüler durumunu koruyarak gizlenir; geri dönünce aynı durumda görünür.
-->
<template>
  <div :id="scope.hostId" class="ek-tab-host" :class="{ 'ek-tab-host--hidden': !active }" :data-tab-code="code">
    <v-defaults-provider :defaults="defaults">
      <slot />
    </v-defaults-provider>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import { provideTabScope } from '@/composables/useTabScope'
import { providePageContext, resolveModuleIcon } from '@/composables/usePageContext'
import { useMenuStore } from '@/stores/site/menu'

const props = defineProps<{ code: string; active: boolean }>()
const scope = provideTabScope(props.code, toRef(props, 'active'))
// A7: breadcrumb kökünün modül ikonu menü kaydından (EkPageBar mağazaya bağlanmaz).
const menuStore: any = useMenuStore()
providePageContext(() => resolveModuleIcon(menuStore?.getMenu?.(), props.code))

// Ham (ds dışı) overlay'ler de sekme sınırında kalır; odak tuzağını Vuetify'ın GENEL tuzağı değil kap sağlar.
const contained = computed(() => ({ attach: scope.hostSelector, contained: true, retainFocus: false, scrollStrategy: 'none' }))
const defaults = computed(() => ({ VDialog: contained.value, VBottomSheet: contained.value }))
</script>

<style scoped>
.ek-tab-host {
  position: relative;
  height: 100%;
}

.ek-tab-host--hidden {
  display: none !important;
}
</style>
