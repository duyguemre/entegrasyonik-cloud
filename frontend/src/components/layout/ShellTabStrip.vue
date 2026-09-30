<!--
  frontend/src/components/layout/ShellTabStrip.vue

  DS-v2 Aşama 2 — çalışma alanı sekme şeridi. Görünüm `EkWorkspaceTabs`
  (gerçek sekme hissi: etkin sekme içerikle birleşir; kapatma hover/etkin'de;
  kesilen başlıkta tooltip; soldaki boşluk YOK — ilk sekme şeridin başından
  başlar). Durum `stores/workspace.ts`'te; bu bileşen yalnızca görünüm + eylem.
    - Sağ tık / Shift+F10: Kapat · Diğerlerini kapat · Sağdakileri kapat
    - Sağ uç: YALNIZ açık sekmeler listesi (Alt+1…9 ipuçlu). Aşama 5: "üst bölümü daralt" ve
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
    >
      <template #trailing>
        <div class="ek-shell-tabs__tools">
          <v-menu v-model="listOpen" location="bottom end" :offset="6">
            <template #activator="{ props: menuProps }">
              <v-tooltip :eager="false" transition="fade-transition" location="bottom" :open-delay="400">
                <template #activator="{ props: tipProps }">
                  <button v-bind="{ ...menuProps, ...tipProps }" type="button" class="ek-shell-tabs__tool" :aria-label="`Açık sekmeler (${viewTabs.length})`">
                    <v-icon icon="mdi-view-list-outline" aria-hidden="true" />
                    <span class="ek-shell-tabs__count ek-num">{{ viewTabs.length }}</span>
                  </button>
                </template>
                <span>Açık sekmeler</span>
              </v-tooltip>
            </template>
            <EkMenuPanel autofocus ref="listPanelRef" class="ek-shell-tabs__list" :groups="listGroups" label="Açık sekmeler" @select="onListSelect" @close="listOpen = false" />
          </v-menu>

        </div>
      </template>
    </EkWorkspaceTabs>

    <v-menu v-model="ctxOpen" :target="ctxPoint" location="bottom start" :offset="4">
      <EkMenuPanel autofocus ref="ctxPanelRef" :groups="ctxGroups" label="Sekme işlemleri" @select="onCtxSelect" @close="ctxOpen = false" />
    </v-menu>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import EkWorkspaceTabs, { type EkWorkspaceTab } from '@/components/ds/EkWorkspaceTabs.vue'
import EkMenuPanel, { type EkMenuGroup, type EkMenuItem } from '@/components/ds/EkMenuPanel.vue'
import { isPinnedLink, useWorkspaceStore } from '@/stores/workspace'
import { shortcutKeys } from '@/navigation/shortcuts'
import { resolveMenuTitle } from '@/navigation/menuTitle'


const { t, te } = useI18n({ useScope: 'global' })
const workspace = useWorkspaceStore()

const tabsRef = ref<InstanceType<typeof EkWorkspaceTabs> | null>(null)
const listPanelRef = ref<InstanceType<typeof EkMenuPanel> | null>(null)
const ctxPanelRef = ref<InstanceType<typeof EkMenuPanel> | null>(null)
const listOpen = ref(false)
const ctxOpen = ref(false)
const ctxPoint = ref<[number, number]>([0, 0])
const ctxTabId = ref<string>()

const titleOf = (link: any) => resolveMenuTitle(link, t, te)

const viewTabs = computed<EkWorkspaceTab[]>(() =>
  workspace.tabs.map((tab: any) => ({
    id: String(tab.id),
    title: titleOf(tab.link),
    // Menüde ikonu olmayan kayıt sekmeleri (ör. ürün düzenleme) için tutarlı bir varsayılan.
    icon: tab.link?.icon ?? (tab.link?.singleton === false ? 'mdi-file-document-edit-outline' : 'mdi-application-outline'),
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

// --- Açık sekmeler listesi ---
const listGroups = computed<EkMenuGroup[]>(() => [
  {
    label: `Açık sekmeler (${viewTabs.value.length})`,
    items: viewTabs.value.map((tab, index) => ({
      key: tab.id,
      label: tab.title,
      icon: tab.id === activeId.value ? 'mdi-check' : tab.icon,
      shortcut: index < 9 ? ['Alt', String(index + 1)] : undefined,
    })),
  },
  {
    items: [{ key: '__close-all', label: 'Tümünü kapat', icon: 'mdi-close-box-multiple-outline', danger: true, disabled: !viewTabs.value.some((x) => x.closable) }],
  },
])

function onListSelect(item: EkMenuItem) {
  listOpen.value = false
  if (item.key === '__close-all') workspace.closeAll()
  else workspace.activateTab(tabById(item.key))
}
</script>

<style scoped>
.ek-shell-tabs {
  position: relative;
}

.ek-shell-tabs__strip {
  height: var(--ek-app-tabstrip-height);
}

.ek-shell-tabs__strip :deep(.ek-tabs__trailing) {
  align-self: stretch;
  align-items: flex-end;
}

.ek-shell-tabs__tools {
  display: flex;
  align-items: center;
  gap: 2px;
  /* Üstteki 12px yüzen tutamağa (ShellChromeHandle) ayrılır: liste düğmesi şeridin altına yaslı, çakışma yok. */
  align-self: flex-end;
  padding: 0 0 var(--ek-space-1) var(--ek-space-1);
}


.ek-shell-tabs__tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  /* Genişlik = üstteki yüzen tutamak (52px): ikisi tek sütun gibi hizalı, sekmelere taşmaz. */
  min-width: 52px;
  height: 24px;
  padding: 0 var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-content-muted);
  font-family: inherit;
  font-size: var(--ek-icon-md);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-shell-tabs__tool:hover {
  background: var(--ek-color-tab-hover);
  color: var(--ek-color-content-strong);
}


.ek-shell-tabs__tool:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.ek-shell-tabs__count {
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}


.ek-shell-tabs__list {
  max-height: min(480px, calc(100vh - 120px));
  overflow-y: auto;
}
</style>
