<!--
  frontend/src/components/layout/EkCommandPalette.vue

  ADR-0015 Karar 2.5 — komut paleti. KAPSAM (orkestratör daraltması, A3):
  YALNIZCA GEZİNME — `screens.ts`/menüde kayıtlı erişilebilir ekranlar +
  açık sekmeler arasında basit (client-side) metin FİLTRESİ. Gerçek bir arama
  motoru DEĞİLDİR; mevcut "Akıllı Arama" (`ApplicationBar` içindeki entity
  arama alanı, ürün/sipariş/müşteri) BU BİLEŞENE TAŞINMADI — o davranış AYNEN
  kaldı (ayrı, dokunulmamış kod yolu).

  `v-dialog` + `v-list` (yeni bağımlılık YOK). Klavye: ↑/↓/Enter/Esc.
  `role="combobox"` (arama kutusu) + `listbox` (sonuç listesi). Ctrl/Cmd+K
  global kısayolu BU bileşen kendi içinde dinler (`window.keydown`) — böylece
  odak nerede olursa olsun çalışır; ayrıca `open()` dışarıdan (üst çubuktaki
  tetikleyici düğme) da çağrılabilir (`defineExpose`).

  PII kuralı (ADR-0012 Karar 2): burada yazılan hiçbir şey URL'ye YAZILMAZ —
  seçim doğrudan `eventBus.emit('openTab', link)` ile mevcut mekanizmaya gider.
-->
<template>
  <!-- ek-pattern-exception: EkFormDialog/EkConfirmDialog yerine — komut paleti kendine özgü bir --><v-dialog v-model="isOpen" max-width="560" scrollable
    :fullscreen="isMobileFullscreen" transition="fade-transition" @keydown.esc="close">
    <v-card class="ek-cmdk">
      <div class="ek-cmdk__input-row">
        <v-icon size="20" class="mr-2" color="var(--ek-color-content-muted)">mdi-magnify</v-icon>
        <input ref="inputRef" v-model="query" type="text" class="ek-cmdk__input" role="combobox"
          aria-expanded="true" aria-controls="ek-cmdk-listbox" :aria-activedescendant="activeDescendantId"
          placeholder="Ekran ara veya git…" autocomplete="off" @keydown="onKeydown" />
        <span class="ek-cmdk__kbd">Esc</span>
      </div>
      <v-divider />
      <v-list id="ek-cmdk-listbox" role="listbox" aria-label="Komut paleti sonuçları" density="compact"
        class="ek-cmdk__list py-1">
        <template v-if="results.length > 0">
          <v-list-item v-for="(item, index) in results" :id="`ek-cmdk-item-${index}`" :key="item.code" role="option"
            :aria-selected="index === activeIndex" class="ek-cmdk__item"
            :class="{ 'ek-cmdk__item--active': index === activeIndex }" @click="select(item)"
            @mouseenter="activeIndex = index">
            <template #prepend>
              <v-icon size="18" class="mr-2">{{ item.icon || 'mdi-compass-outline' }}</v-icon>
            </template>
            <v-list-item-title class="text-body-2">{{ item.title }}</v-list-item-title>
            <template #append v-if="item.kind === 'open-tab'">
              <span class="ek-cmdk__badge">Açık</span>
            </template>
          </v-list-item>
        </template>
        <div v-else class="ek-cmdk__empty">Eşleşen ekran bulunamadı.</div>
      </v-list>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMenuStore } from '@/stores/site/menu'
import { useWorkspaceStore } from '@/stores/workspace'
import { useShellBreakpoints } from '@/composables/useShellBreakpoints'

const menuStore: any = useMenuStore()
const workspace = useWorkspaceStore()
const eventBus: any = inject('eventBus')
const { t } = useI18n({ useScope: 'global' })
const { isMobile } = useShellBreakpoints()

const isOpen = ref(false)
const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const isMobileFullscreen = computed(() => isMobile.value)

interface PaletteItem {
  code: string
  title: string
  icon?: string
  kind: 'screen' | 'open-tab'
  link: any
}

/** Menüde erişilebilir tüm ekranlar (grup/alt-grup düz listeye açılır) — Bağlam: erişilebilirliğin
 * kaynağı DEĞİŞMEDİ, burada yalnızca zaten menüde OLAN öğeler listelenir. */
const allScreens = computed<PaletteItem[]>(() => {
  const out: PaletteItem[] = []
  const groups = menuStore?.getMenu?.() || []
  for (const group of groups) {
    if (!group || group.group === 'favorites') continue
    for (const link of group.links || []) {
      if (!link || link.status === false || link.inMenu === false) continue
      if (link.children && link.children.length > 0) {
        for (const child of link.children) {
          if (!child || child.status === false || child.inMenu === false) continue
          out.push({ code: child.code, title: t(child.fullPath), icon: child.icon, kind: 'screen', link: child })
        }
      } else if (link.code !== 'ExitView') {
        out.push({ code: link.code, title: t(link.fullPath), icon: link.icon, kind: 'screen', link })
      }
    }
  }
  return out
})

/** Açık sekmeler — komut paletinin "Kayıtlar" değil "son açılanlar/açık sekmeler" kaynağı (Karar 2.5). */
const openTabItems = computed<PaletteItem[]>(() => {
  return (workspace.tabSelectors || [])
    .map((el: any) => (el.list ? el.selectedTabSelector : el))
    .filter((el: any) => el?.link)
    .map((el: any) => ({
      code: el.link.code,
      title: el.link.singleton === false ? el.link.title : t(el.link.fullPath),
      icon: el.link.icon,
      kind: 'open-tab' as const,
      link: el.link,
    }))
})

const results = computed<PaletteItem[]>(() => {
  const q = query.value.trim().toLocaleLowerCase('tr-TR')
  const source = q ? allScreens.value : [...openTabItems.value, ...allScreens.value]
  const filtered = q ? source.filter((item) => item.title.toLocaleLowerCase('tr-TR').includes(q)) : source
  // Aynı `code` için tekilleştir (açık sekme + menü eşleşmesi çift görünmesin).
  const seen = new Set<string>()
  const unique: PaletteItem[] = []
  for (const item of filtered) {
    if (seen.has(item.code)) continue
    seen.add(item.code)
    unique.push(item)
  }
  return unique.slice(0, 20)
})

const activeDescendantId = computed(() => (results.value.length ? `ek-cmdk-item-${activeIndex.value}` : undefined))

function open() {
  isOpen.value = true
  query.value = ''
  activeIndex.value = 0
  nextTick(() => inputRef.value?.focus())
}
function close() {
  isOpen.value = false
}
function toggle() {
  if (isOpen.value) close(); else open()
}

function select(item: PaletteItem) {
  eventBus?.emit('openTab', item.link)
  close()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (results.value.length) activeIndex.value = (activeIndex.value + 1) % results.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (results.value.length) activeIndex.value = (activeIndex.value - 1 + results.value.length) % results.value.length
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const item = results.value[activeIndex.value]
    if (item) select(item)
  } else if (event.key === 'Escape') {
    close()
  }
}

function onGlobalKeydown(event: KeyboardEvent) {
  const isCmdK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
  if (!isCmdK) return
  event.preventDefault()
  toggle()
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))

defineExpose({ open, close, toggle })
</script>

<style scoped>
.ek-cmdk {
  border-radius: var(--ek-radius-lg) !important;
}

.ek-cmdk__input-row {
  display: flex;
  align-items: center;
  padding: var(--ek-space-4);
}

.ek-cmdk__input {
  flex: 1 1 auto;
  border: none;
  outline: none;
  font-size: var(--ek-font-size-md);
  color: var(--ek-color-content-strong);
  background: transparent;
}

.ek-cmdk__kbd {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-sm);
  padding: 1px 6px;
}

.ek-cmdk__list {
  max-height: 360px;
}

.ek-cmdk__item {
  cursor: pointer;
  min-height: 40px !important;
}

.ek-cmdk__item--active {
  background-color: var(--ek-color-surface-muted);
}

.ek-cmdk__badge {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.ek-cmdk__empty {
  padding: var(--ek-space-6);
  text-align: center;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-font-size-sm);
}
</style>
