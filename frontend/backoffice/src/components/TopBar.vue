<template>
  <header class="bo-top" :class="`env-${env.key}`">
    <div class="bo-top__start">
      <button type="button" class="bo-top__icon-btn" :aria-label="menuOpen ? 'Menüyü kapat' : 'Menüyü aç'" :aria-expanded="menuOpen" @click="$emit('toggle-menu')">
        <v-icon icon="mdi-menu" aria-hidden="true" />
      </button>
      <RouterLink to="/" class="bo-top__brand" aria-label="Entegrasyonik Yönetim — genel bakış">
        <EkBrandLogo tone="inverse" :variant="compact ? 'mark' : 'full'" :size="26" />
        <span class="bo-top__product">Yönetim</span>
      </RouterLink>
      <span class="bo-top__env" :class="`is-${env.key}`" :title="env.hint" data-testid="env-badge">
        <v-icon :icon="env.icon" aria-hidden="true" /><span>{{ env.label }}</span><span class="ek-sr-only"> ortamı — {{ env.hint }}</span>
      </span>
    </div>

    <button type="button" class="bo-top__search" :class="{ 'is-compact': compact }" aria-label="Komut paleti: ekran, müşteri ya da istek ara (Ctrl+K)" data-testid="command-open" @click="$emit('open-palette')">
      <v-icon icon="mdi-magnify" aria-hidden="true" />
      <template v-if="!compact">
        <span class="bo-top__search-text">Ekran, müşteri ya da istek ara…</span>
        <EkKbd :keys="[modKey, 'K']" tone="chrome" />
      </template>
    </button>

    <div class="bo-top__end">
      <button
        v-if="otopilot.available.value"
        type="button"
        class="bo-top__icon-btn bo-top__otopilot"
        :class="{ 'is-open': otopilot.panelOpen.value || otopilot.onPage.value }"
        :aria-label="`${CHAT_PRODUCT.name} (${modKey}+J)`"
        :aria-pressed="otopilot.panelOpen.value"
        :title="`${CHAT_PRODUCT.name} — salt okuma (${modKey}+J)`"
        data-testid="otopilot-launcher"
        @click="otopilot.toggle('button')"
      >
        <v-icon icon="mdi-creation-outline" aria-hidden="true" />
        <span v-if="!compact" class="bo-top__otopilot-label">{{ CHAT_PRODUCT.name }}</span>
      </button>
      <StepUpIndicator :compact="compact" />
      <v-menu location="bottom end" :offset="6">
        <template #activator="{ props: menu }">
          <button v-bind="menu" type="button" class="bo-top__icon-btn" :aria-label="`Tema: ${themeLabel}`" data-testid="theme-menu">
            <v-icon :icon="themeIcon" aria-hidden="true" />
          </button>
        </template>
        <div class="bo-menu" role="group" aria-label="Tema">
          <p class="bo-menu__label">Tema</p>
          <button
            v-for="opt in THEME_OPTIONS"
            :key="opt.value"
            type="button"
            class="bo-menu__item"
            role="menuitemradio"
            :aria-checked="themePreference === opt.value"
            :data-theme-option="opt.value"
            @click="setThemePreference(opt.value)"
          >
            <v-icon :icon="opt.icon" aria-hidden="true" />
            <span>{{ opt.label }}</span>
            <v-icon v-if="themePreference === opt.value" class="bo-menu__check" icon="mdi-check" aria-hidden="true" />
          </button>
        </div>
      </v-menu>

      <v-menu location="bottom end" :offset="6">
        <template #activator="{ props: menu }">
          <button v-bind="menu" type="button" class="bo-top__user" :aria-label="`Hesap menüsü: ${user?.name ?? ''}`" data-testid="account-menu">
            <span class="bo-top__avatar" aria-hidden="true">{{ initials }}</span>
            <span v-if="!compact" class="bo-top__user-text">
              <span class="bo-top__user-name">{{ user?.name }}</span>
              <span class="bo-top__user-meta">Platform yöneticisi</span>
            </span>
            <v-icon v-if="!compact" class="bo-top__chevron" icon="mdi-chevron-down" aria-hidden="true" />
          </button>
        </template>
        <div class="bo-menu bo-menu--account">
          <div class="bo-menu__who">
            <strong>{{ user?.name }}</strong>
            <span>{{ user?.email }}</span>
          </div>
          <dl class="bo-menu__facts">
            <div><dt>Oturum açıldı</dt><dd>{{ user ? formatDateTime(user.authTime) : '—' }}</dd></div>
            <div><dt>Son doğrulama</dt><dd>{{ user?.reauthAt ? formatRelative(user.reauthAt) : '—' }}</dd></div>
            <div><dt>2 adımlı doğrulama</dt><dd>Etkin</dd></div>
          </dl>
          <button type="button" class="bo-menu__item bo-menu__item--danger" data-testid="logout" @click="$emit('logout')">
            <v-icon icon="mdi-logout" aria-hidden="true" />
            <span>Çıkış yap</span>
          </button>
        </div>
      </v-menu>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkBrandLogo, EkKbd } from '@entegrasyonik/ui/components'
import StepUpIndicator from '@bo/components/shell/StepUpIndicator.vue'
import type { ThemePreference } from '@entegrasyonik/ui/theme'
import { currentEnv } from '@bo/utils/env'
import { session } from '@bo/auth/session'
import { CHAT_PRODUCT } from '@entegrasyonik/chat/brand'
import { otopilot } from '@bo/chat/otopilot'
import { setThemePreference, themeMode, themePreference } from '@bo/theme'
import { formatDateTime, formatRelative } from '@bo/utils/format'

defineProps<{ menuOpen: boolean; compact: boolean }>()
defineEmits<{ 'toggle-menu': []; logout: []; 'open-palette': [] }>()

const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: string }> = [
  { value: 'system', label: 'Sistem', icon: 'mdi-monitor' },
  { value: 'light', label: 'Açık', icon: 'mdi-white-balance-sunny' },
  { value: 'dark', label: 'Koyu', icon: 'mdi-weather-night' },
]

const user = computed(() => session.state.user)
const initials = computed(() =>
  (user.value?.name ?? '')
    .split(/\s+/)
    .slice(-2)
    .map((w) => w.charAt(0))
    .join('')
    .toLocaleUpperCase('tr-TR'),
)
const themeLabel = computed(() => THEME_OPTIONS.find((o) => o.value === themePreference.value)?.label ?? '')
const themeIcon = computed(() => (themeMode.value === 'dark' ? 'mdi-weather-night' : 'mdi-white-balance-sunny'))

const env = currentEnv
</script>

<style scoped>
.bo-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  height: var(--ek-app-topbar-height);
  padding: 0 var(--ek-space-3);
  background: var(--ek-gradient-chrome);
  color: var(--ek-color-chrome-text);
  box-shadow: var(--ek-shadow-chrome);
}

.bo-top__start,
.bo-top__end {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
}

.bo-top__brand {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 var(--ek-space-2) 0 var(--ek-space-1);
  padding: var(--ek-space-1);
  border-radius: var(--ek-radius-control);
  color: inherit;
  text-decoration: none;
}

.bo-top__brand:focus-visible,
.bo-top__icon-btn:focus-visible,
.bo-top__user:focus-visible {
  outline: 2px solid var(--ek-color-chrome-text);
  outline-offset: 1px;
}

.bo-top__product {
  padding-left: var(--ek-space-2);
  border-left: 1px solid var(--ek-color-chrome-border);
  color: var(--ek-color-chrome-text);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.02em;
}

.bo-top__env {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  height: var(--ek-control-h-sm);
  padding: 0 var(--ek-space-3) 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-chrome-raised);
  color: var(--ek-color-chrome-text);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  white-space: nowrap;
}

.bo-top__env .v-icon {
  font-size: var(--ek-icon-sm);
}

.bo-top__env.is-mock .v-icon {
  color: var(--ek-color-info);
}

.bo-top__env.is-staging {
  border-color: var(--ek-color-warning);
  background: var(--ek-color-warning);
  color: var(--ek-color-warning-contrast);
}

.bo-top__env.is-production {
  border-color: var(--ek-color-error);
  background: var(--ek-color-error);
  color: var(--ek-color-error-contrast);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* Üst kenarda ortam şeridi: staging sarı, üretim kırmızı (kaydırmada da görünür — bar sabit). */
.bo-top.env-staging {
  box-shadow: inset 0 3px 0 var(--ek-color-warning), var(--ek-shadow-chrome);
}

.bo-top.env-production {
  box-shadow: inset 0 3px 0 var(--ek-color-error), var(--ek-shadow-chrome);
}

.bo-top__search {
  display: inline-flex;
  flex: 0 1 420px;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
  height: var(--ek-control-h-md);
  margin: 0 auto;
  padding: 0 var(--ek-space-2) 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-chrome-raised);
  color: var(--ek-color-chrome-text-muted);
  font: inherit;
  font-size: var(--ek-type-label-size);
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.bo-top__search:hover {
  color: var(--ek-color-chrome-text);
}

.bo-top__search:focus-visible {
  outline: 2px solid var(--ek-color-chrome-text);
  outline-offset: 1px;
}

.bo-top__search-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bo-top__search.is-compact {
  flex: none;
  justify-content: center;
  width: var(--ek-control-h-md);
  margin: 0 0 0 auto;
  padding: 0;
  border-color: transparent;
  background: transparent;
  color: var(--ek-color-chrome-text);
  font-size: var(--ek-icon-lg);
}

.bo-top__icon-btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
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

.bo-top__otopilot {
  gap: var(--ek-space-2);
  width: auto;
  padding: 0 var(--ek-space-2);
  font-size: var(--ek-icon-md);
}
.bo-top__otopilot-label {
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
}
.bo-top__otopilot.is-open {
  border-color: var(--ek-color-chrome-border);
  background: var(--ek-color-chrome-raised);
}

.bo-top__icon-btn:hover,
.bo-top__user:hover {
  border-color: var(--ek-color-chrome-border);
  background: var(--ek-color-chrome-raised);
}

.bo-top__user {
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

.bo-top__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-bold);
}

.bo-top__user-text {
  display: flex;
  flex-direction: column;
  max-width: 180px;
}

.bo-top__user-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-top__user-meta,
.bo-top__chevron {
  color: var(--ek-color-chrome-text-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 200px;
  padding: var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-popover);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-popover);
}

.bo-menu--account {
  min-width: 280px;
}

.bo-menu__label {
  margin: 0;
  padding: var(--ek-space-1) var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-menu__item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: 100%;
  min-height: 36px;
  padding: 0 var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: var(--ek-color-content-default);
  font: inherit;
  font-size: var(--ek-type-body-size);
  text-align: left;
  cursor: pointer;
}

.bo-menu__item:hover,
.bo-menu__item:focus-visible {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
  outline: none;
}

.bo-menu__item:focus-visible {
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.bo-menu__check {
  margin-left: auto;
  color: var(--ek-color-action);
}

.bo-menu__item--danger {
  color: var(--ek-color-error-emphasis);
}

.bo-menu__who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ek-space-2);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
}

.bo-menu__who span {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}

.bo-menu__facts {
  display: grid;
  gap: var(--ek-space-1);
  margin: 0 0 var(--ek-space-1);
  padding: var(--ek-space-2);
  border-top: 1px solid var(--ek-color-border-subtle);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.bo-menu__facts div {
  display: flex;
  justify-content: space-between;
  gap: var(--ek-space-3);
  font-size: var(--ek-type-label-size);
}

.bo-menu__facts dt {
  color: var(--ek-color-content-muted);
}

.bo-menu__facts dd {
  margin: 0;
  color: var(--ek-color-content-strong);
}

@media (max-width: 599px) {
  .bo-top__product {
    display: none;
  }

  .bo-top {
    gap: var(--ek-space-1);
    padding: 0 var(--ek-space-2);
  }

  .bo-top__start,
  .bo-top__end {
    gap: var(--ek-space-1);
  }

  .bo-top__brand {
    margin: 0;
  }
}

@media (max-width: 1199px) {
  .bo-top__search:not(.is-compact) {
    flex-basis: 280px;
  }
}
</style>
