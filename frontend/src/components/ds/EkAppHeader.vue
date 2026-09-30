<!--
  frontend/src/components/ds/EkAppHeader.vue

  DS-v2 — kimlik taşıyan üst bar (chrome). Tek marka degradesi
  (`--ek-gradient-chrome`), üzerindeki tüm kontroller `chrome-raised`
  zeminli ve `chrome-border` çerçeveli — aynı dil.
    [☰] [logo]   [#search ...........]   [🔔 n] [?] [profil]
  Aşama 5: "Genel | Seçili kayıt" çalışma alanı anahtarı KALDIRILDI (kullanıcı geri bildirimi: anlamı
  anlaşılmıyordu; kayıt bağlamına sekme şeridinden zaten erişilir).
  Ek (geri uyumlu): menü düğmesinde kısayollu ipucu; `data-header-action`
  çapaları (kabuk, v-menu'leri bu düğmelere bağlar); `#end-start` slot'u.
-->
<template>
  <header class="ek-header">
    <div class="ek-header__start">
      <v-tooltip :eager="false" transition="fade-transition" location="bottom" :open-delay="400">
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
    userName: string
    storeName: string
    notificationCount?: number
    compact?: boolean
    /** Menü düğmesi ipucundaki kısayol (kabuk kısayol kaydından gelir). */
    menuShortcut?: string[]
    /** Sol menü açık mı (menü düğmesi `aria-expanded`). */
    menuExpanded?: boolean
  }>(),
  {
    notificationCount: 0,
    compact: false,
    menuShortcut: () => ['Ctrl', 'B'],
    menuExpanded: undefined,
  },
)

const emit = defineEmits<{
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
.ek-header__user:focus-visible {
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
