<!--
  frontend/src/components/ds/EkAppHeader.vue

  DS-v2 — kimlik taşıyan üst bar (chrome). Tek marka degradesi
  (`--ek-gradient-chrome`), üzerindeki tüm kontroller `chrome-raised`
  zeminli ve `chrome-border` çerçeveli — aynı dil.
    [☰] [logo]  [Genel | Seçili kayıt]   [#search ...........]   [🔔 n] [?] [profil]
  Çalışma alanı anahtarı: genel çalışma alanı ↔ seçili kayıt bağlamı
  (sipariş/ürün/entegrasyon). Bağlam yoksa ikinci segment devre dışıdır.
  Dar ekranda (<768) segment etiketleri gizlenir, yalnız ikonlar kalır.
  Ek (geri uyumlu): menü düğmesinde kısayollu ipucu; `data-header-action`
  çapaları (kabuk, v-menu'leri bu düğmelere bağlar); `#end-start` slot'u.
-->
<template>
  <header class="ek-header">
    <div class="ek-header__start">
      <v-tooltip :eager="false" location="bottom" :open-delay="400">
        <template #activator="{ props: tip }">
          <button
            v-bind="tip"
            type="button"
            class="ek-header__icon-btn"
            data-header-action="menu"
            :aria-label="`Menüyü aç/kapat (${menuShortcut.join('+')})`"
            :aria-expanded="menuExpanded"
            @click="emit('toggle-menu')"
          >
            <v-icon icon="mdi-menu" aria-hidden="true" />
          </button>
        </template>
        <span class="ek-header__tip">Menüyü aç/kapat <EkKbd :keys="menuShortcut" tone="inverse" /></span>
      </v-tooltip>
      <EkBrandLogo tone="inverse" :variant="compact ? 'mark' : 'full'" :size="28" class="ek-header__brand" />
      <div class="ek-header__switch" role="radiogroup" aria-label="Çalışma alanı">
        <button
          type="button"
          role="radio"
          class="ek-header__segment"
          :class="{ 'is-on': workspace === 'general' }"
          :aria-checked="workspace === 'general'"
          @click="emit('update:workspace', 'general')"
        >
          <v-icon icon="mdi-view-dashboard-outline" aria-hidden="true" />
          <span class="ek-header__segment-label">Genel</span>
        </button>
        <button
          type="button"
          role="radio"
          class="ek-header__segment"
          :class="{ 'is-on': workspace === 'record' }"
          :aria-checked="workspace === 'record'"
          :disabled="!recordLabel"
          :title="recordLabel ? recordLabel : recordHint"
          @click="emit('update:workspace', 'record')"
        >
          <v-icon icon="mdi-package-variant-closed" aria-hidden="true" />
          <span class="ek-header__segment-label">{{ recordLabel ?? 'Seçili kayıt' }}</span>
        </button>
      </div>
    </div>

    <div class="ek-header__center">
      <slot name="search" />
    </div>

    <div class="ek-header__end">
      <slot name="end-start" />
      <button type="button" class="ek-header__icon-btn" data-header-action="notifications" :aria-label="`Bildirimler, ${notificationCount} okunmamış`" @click="emit('notifications')">
        <v-icon icon="mdi-bell-outline" aria-hidden="true" />
        <EkBadge v-if="notificationCount" class="ek-header__count" variant="count" tone="error" :text="notificationCount" />
      </button>
      <button type="button" class="ek-header__icon-btn ek-header__help" data-header-action="help" aria-label="Yardım merkezi" aria-haspopup="menu" @click="emit('help')">
        <v-icon icon="mdi-help-circle-outline" aria-hidden="true" />
      </button>
      <button type="button" class="ek-header__user" data-header-action="account" :aria-label="`Hesap menüsü: ${userName}`" aria-haspopup="menu" @click="emit('account')">
        <span class="ek-header__avatar" aria-hidden="true">{{ initials }}</span>
        <span v-if="!compact" class="ek-header__user-text">
          <span class="ek-header__user-name">{{ userName }}</span>
          <span class="ek-header__user-meta">{{ storeName }}</span>
        </span>
        <v-icon v-if="!compact" class="ek-header__user-chevron" icon="mdi-chevron-down" aria-hidden="true" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkBrandLogo from './EkBrandLogo.vue'
import EkBadge from './EkBadge.vue'
import EkKbd from './EkKbd.vue'

const props = withDefaults(
  defineProps<{
    workspace?: 'general' | 'record'
    recordLabel?: string
    userName: string
    storeName: string
    notificationCount?: number
    compact?: boolean
    /** Menü düğmesi ipucundaki kısayol (kabuk kısayol kaydından gelir). */
    menuShortcut?: string[]
    /** Sol menü açık mı (menü düğmesi `aria-expanded`). */
    menuExpanded?: boolean
    /** Seçili kayıt yokken ikinci segmentin açıklaması. */
    recordHint?: string
  }>(),
  {
    workspace: 'general',
    notificationCount: 0,
    compact: false,
    menuShortcut: () => ['Ctrl', 'B'],
    menuExpanded: undefined,
    recordHint: 'Bir kayıt (ör. ürün düzenleme) açıldığında etkinleşir',
  },
)

const emit = defineEmits<{
  'update:workspace': [value: 'general' | 'record']
  'toggle-menu': []
  notifications: []
  help: []
  account: []
}>()

const initials = computed(() =>
  props.userName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('')
    .toLocaleUpperCase('tr-TR'),
)
</script>

<style scoped>
.ek-header {
  display: flex;
  align-items: center;
  gap: var(--ek-space-4);
  height: 56px;
  padding: 0 var(--ek-space-3);
  background: var(--ek-gradient-chrome);
  color: var(--ek-color-chrome-text);
  box-shadow: var(--ek-shadow-chrome);
}

.ek-header__start,
.ek-header__end {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-header__end {
  justify-content: flex-end;
}

.ek-header__center {
  display: flex;
  flex: 1;
  justify-content: center;
  min-width: 160px;
}

.ek-header__brand {
  margin: 0 var(--ek-space-2) 0 var(--ek-space-1);
}

.ek-header__icon-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--ek-control-h-md);
  height: var(--ek-control-h-md);
  border: 1px solid transparent;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-chrome-text);
  font-size: var(--ek-icon-lg);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-header__icon-btn:hover,
.ek-header__user:hover {
  background: var(--ek-color-chrome-raised);
  border-color: var(--ek-color-chrome-border);
}

.ek-header__icon-btn:focus-visible,
.ek-header__user:focus-visible,
.ek-header__segment:focus-visible {
  outline: 2px solid var(--ek-color-chrome-text);
  outline-offset: 1px;
}

.ek-header__tip {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-header__count {
  position: absolute;
  top: 2px;
  right: 2px;
  box-shadow: 0 0 0 2px var(--ek-color-chrome);
}

.ek-header__switch {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-chrome);
}

.ek-header__segment {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  height: 30px;
  max-width: 200px;
  padding: 0 var(--ek-space-3);
  border: 0;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: var(--ek-color-chrome-text-muted);
  font-family: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-header__segment :deep(.v-icon) {
  font-size: var(--ek-icon-sm);
}

.ek-header__segment-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ek-header__segment:hover:not(:disabled) {
  color: var(--ek-color-chrome-text);
}

.ek-header__segment.is-on {
  background: var(--ek-color-surface);
  color: var(--ek-color-action-emphasis);
  box-shadow: var(--ek-shadow-card);
}

.ek-header__segment:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ek-header__user {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  height: 40px;
  padding: 0 var(--ek-space-2) 0 var(--ek-space-1);
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-chrome-raised);
  color: var(--ek-color-chrome-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-header__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-action);
  color: var(--ek-color-chrome-text);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-bold);
}

.ek-header__user-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 180px;
}

.ek-header__user-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-header__user-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ek-color-chrome-text-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-header__user-chevron {
  color: var(--ek-color-chrome-text-muted);
  font-size: var(--ek-icon-sm);
}

@media (max-width: 767px) {
  .ek-header {
    gap: var(--ek-space-2);
    padding: 0 var(--ek-space-2);
  }

  .ek-header__segment-label,
  .ek-header__switch,
  .ek-header__help {
    display: none;
  }

  .ek-header__center {
    min-width: 0;
  }

  .ek-header__user {
    padding: 0 var(--ek-space-1);
    border-color: transparent;
    background: transparent;
  }
}
</style>
