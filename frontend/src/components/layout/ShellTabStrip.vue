<!--
  frontend/src/components/layout/ShellTabStrip.vue

  DS-v2 Aşama 2 — çalışma alanı sekme şeridi. Görünüm `EkWorkspaceTabs`
  (gerçek sekme hissi: etkin sekme içerikle birleşir; kapatma hover/etkin'de;
  kesilen başlıkta tooltip; soldaki boşluk YOK — ilk sekme şeridin başından
  başlar). Durum `stores/workspace.ts`'te; bu bileşen yalnızca görünüm + eylem.
    - Sağ tık / Shift+F10: Kapat · Diğerlerini kapat · Sağdakileri kapat
    - Sağ uç: FR3 madde 4 — TEK "Tüm sekmeler" düğmesi (EkWorkspaceTabs: toplam + şeritte görünmeyen "+N"; liste
      Alt+1…9 ipuçlu, sonda "Tümünü kapat"). Önceki ayrı "+N" ve "≡ toplam" düğmeleri birleşti. Aşama 5: "üst bölümü daralt" ve
      "tam ekran" düğmeleri şeridi daralttığı için buradan kalktı → üst barın alt kenarındaki yüzen
      tutamak (`ShellChromeHandle`) + kısayollar (Ctrl+Shift+H / Ctrl+Shift+F).
  Her sekme ayrı bir örnektir (çok örnekli kayıt sekmeleri de ayrı sekme).
  Spec çapası: kök `.workplace-tabs` (kabuğun mount olduğunun işareti).
-->
<template>
  <div class="workplace-tabs ek-shell-tabs">
    <EkWorkspaceTabs
      ref="tabsRef"
      class="ek-shell-tabs__strip"
      :tabs="viewTabs"
      :model-value="activeId"
      label="Açık sekmeler"
      @update:model-value="onActivate"
      @close="onClose"
      @contextmenu="onContextMenu"
      :shortcut-for-index="(i: number) => (i < 9 ? ['Alt', String(i + 1)] : undefined)"
      :list-actions="listActions"
      @list-action="onListAction"
    >
    </EkWorkspaceTabs>

    <v-menu v-model="ctxOpen" :target="ctxPoint" location="bottom start" :offset="4">
      <EkMenuPanel autofocus ref="ctxPanelRef" :groups="ctxGroups" label="Sekme işlemleri" @select="onCtxSelect" @close="ctxOpen = false" />
    </v-menu>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { EkWorkspaceTabs, type EkWorkspaceTab, EkMenuPanel, type EkMenuGroup, type EkMenuItem } from '@entegrasyonik/ui/components'
import { isPinnedLink, useWorkspaceStore } from '@/stores/workspace'
import { shortcutKeys } from '@entegrasyonik/ui/shortcuts'
import { resolveMenuTitle } from '@/navigation/menuTitle'


const { t, te } = useI18n({ useScope: 'global' })
const workspace = useWorkspaceStore()

const tabsRef = ref<InstanceType<typeof EkWorkspaceTabs> | null>(null)
const ctxPanelRef = ref<InstanceType<typeof EkMenuPanel> | null>(null)
const ctxOpen = ref(false)
const ctxPoint = ref<[number, number]>([0, 0])
const ctxTabId = ref<string>()

const titleOf = (link: any) => resolveMenuTitle(link, t, te)

const viewTabs = computed<EkWorkspaceTab[]>(() =>
  workspace.tabs.map((tab: any) => ({
    id: String(tab.id),
    title: titleOf(tab.link),
    // Menüde ikonu olmayan kayıt sekmeleri (ör. ürün düzenleme) için tutarlı bir varsayılan.
    icon: tab.link?.icon ?? (tab.link?.singleton === false ? 'mdi-pencil-outline' : 'mdi-application-outline'),
    closable: !isPinnedLink(tab.link),
  })),
)
const activeId = computed(() => (workspace.mySelectedTab ? String(workspace.mySelectedTab.id) : ''))
const tabById = (id: string | undefined) => workspace.tabs.find((tab: any) => String(tab.id) === id)

function onActivate(id: string) {
  workspace.activateTab(tabById(id))
}

function onClose(id: string) {
  const tab = tabById(id)
  if (tab && !isPinnedLink(tab.link)) workspace.closeTab(tab)
}


// --- Sağ tık menüsü ---
const ctxGroups = computed<EkMenuGroup[]>(() => {
  const tabs = workspace.tabs
  const index = tabs.findIndex((tab: any) => String(tab.id) === ctxTabId.value)
  const tab = tabs[index]
  const closable = (list: any[]) => list.some((x: any) => !isPinnedLink(x.link))
  return [
    {
      items: [
        { key: 'close', label: 'Kapat', icon: 'mdi-close', shortcut: shortcutKeys('tabClose'), disabled: !tab || isPinnedLink(tab.link) },
        { key: 'close-others', label: 'Diğerlerini kapat', icon: 'mdi-tab-remove', disabled: !closable(tabs.filter((x: any) => x !== tab)) },
        { key: 'close-right', label: 'Sağdakileri kapat', icon: 'mdi-arrow-collapse-right', disabled: !closable(tabs.slice(index + 1)) },
      ],
    },
  ]
})

function onContextMenu(id: string, point: { x: number; y: number }) {
  ctxTabId.value = id
  ctxPoint.value = [point.x, point.y]
  ctxOpen.value = true
}

function onCtxSelect(item: EkMenuItem) {
  const tab = tabById(ctxTabId.value)
  ctxOpen.value = false
  if (!tab) return
  if (item.key === 'close') workspace.closeTab(tab)
  else if (item.key === 'close-others') workspace.closeOthers(tab)
  else if (item.key === 'close-right') workspace.closeToRight(tab)
  nextTick(() => tabsRef.value?.focusActive())
}

// --- FR3 madde 4: "Tüm sekmeler" listesi tek düğmede (EkWorkspaceTabs) — kabuk yalnız liste sonu eylemini verir ---
const listActions = computed<EkMenuItem[]>(() => [
  { key: '__close-all', label: 'Tümünü kapat', icon: 'mdi-close-box-multiple-outline', danger: true, disabled: !viewTabs.value.some((x) => x.closable) },
])

function onListAction(key: string) {
  if (key === '__close-all') workspace.closeAll()
}
</script>

<style scoped>
.ek-shell-tabs {
  position: relative;
}

.ek-shell-tabs__strip {
  height: var(--ek-app-tabstrip-height);
}

</style>
