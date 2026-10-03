<template>
  <!-- Üst bar uygulamayla aynı: bir ton açık kabuk (`chrome-soft*`), sade profil, hap Otopilot girişi; kısayollar ipucunda. -->
  <header class="bo-top" :class="`env-${env.key}`">
    <div class="bo-top__start">
      <v-tooltip location="bottom" :open-delay="400" transition="fade-transition">
        <template #activator="{ props: tip }">
          <button v-bind="tip" type="button" class="bo-top__icon-btn" :aria-label="menuOpen ? 'Menüyü kapat' : 'Menüyü aç'" :aria-expanded="menuOpen" @click="$emit('toggle-menu')">
            <v-icon icon="mdi-menu" aria-hidden="true" />
          </button>
        </template>
        <span>{{ menuOpen ? 'Menüyü kapat' : 'Menüyü aç' }}</span>
      </v-tooltip>
      <RouterLink to="/" class="bo-top__brand" aria-label="Entegrasyonik Yönetim — genel bakış">
        <EkBrandLogo tone="inverse" :variant="compact ? 'mark' : 'full'" :size="26" />
        <span class="bo-top__product">Yönetim</span>
      </RouterLink>
      <span class="bo-top__env" :class="`is-${env.key}`" :title="env.hint" data-testid="env-badge">
        <v-icon :icon="env.icon" aria-hidden="true" /><span>{{ env.label }}</span><span class="ek-sr-only"> ortamı — {{ env.hint }}</span>
      </span>
    </div>

    <v-tooltip location="bottom" :open-delay="400" transition="fade-transition">
      <template #activator="{ props: tip }">
        <button v-bind="tip" type="button" class="bo-top__search" :class="{ 'is-compact': compact }" :aria-label="`Komut paleti: ekran, müşteri ya da istek ara (${modKey}+K)`" aria-keyshortcuts="Control+K" data-testid="command-open" @click="$emit('open-palette')">
          <v-icon icon="mdi-magnify" aria-hidden="true" />
          <span v-if="!compact" class="bo-top__search-text">Ekran, müşteri ya da istek ara…</span>
        </button>
      </template>
      <span class="bo-top__tip">Komut paleti <EkKbd :keys="[modKey, 'K']" tone="inverse" /></span>
    </v-tooltip>

    <div class="bo-top__end">
      <v-tooltip v-if="otopilot.available.value" location="bottom" :open-delay="400" transition="fade-transition">
        <template #activator="{ props: tip }">
          <button
            v-bind="tip"
            type="button"
            class="bo-top__otopilot"
            :class="{ 'is-active': otopilot.panelOpen.value || otopilot.onPage.value, 'is-compact': compact }"
            :aria-label="`${otopilotHint} (${modKey}+J)`"
            aria-keyshortcuts="Control+J"
            :aria-pressed="otopilot.panelOpen.value || otopilot.onPage.value ? 'true' : 'false'"
            data-testid="otopilot-launcher"
            @click="otopilot.toggle('button')"
          >
            <v-icon :icon="CHAT_ICON" aria-hidden="true" />
            <span v-if="!compact" class="bo-top__otopilot-label">{{ CHAT_PRODUCT.name }}</span>
          </button>
        </template>
        <span class="bo-top__tip">{{ otopilotHint }} <EkKbd :keys="[modKey, 'J']" tone="inverse" /></span>
      </v-tooltip>
      <StepUpIndicator :compact="compact" />

      <v-menu v-model="accountOpen" location="bottom end" :offset="8" :close-on-content-click="false">
        <template #activator="{ props: menu }">
          <button v-bind="menu" type="button" class="bo-top__user" :aria-label="`Hesap menüsü: ${user?.name ?? ''}`" aria-haspopup="menu" data-testid="account-menu">
            <span class="bo-top__avatar" aria-hidden="true">{{ initials }}</span>
            <span v-if="!compact" class="bo-top__user-text">
              <span class="bo-top__user-name">{{ user?.name }}</span>
              <span class="bo-top__user-meta">Platform yöneticisi</span>
            </span>
            <v-icon v-if="!compact" class="bo-top__chevron" icon="mdi-chevron-down" aria-hidden="true" />
          </button>
        </template>
        <div class="bo-account">
          <div class="bo-account__head">
            <span class="bo-account__avatar" aria-hidden="true">{{ initials }}</span>
            <div class="bo-account__who">
              <span class="bo-account__name">{{ user?.name }}</span>
              <span class="bo-account__meta">{{ user?.email }}</span>
            </div>
          </div>
          <dl class="bo-account__facts">
            <div><dt>Oturum açıldı</dt><dd>{{ user ? formatDateTime(user.authTime) : '—' }}</dd></div>
            <div><dt>Son doğrulama</dt><dd>{{ user?.reauthAt ? formatRelative(user.reauthAt) : '—' }}</dd></div>
            <div><dt>2 adımlı doğrulama</dt><dd>Etkin</dd></div>
          </dl>
          <EkThemeSwitch class="bo-account__theme" :model-value="themePreference" data-testid="theme-menu" @update:model-value="setThemePreference" />
          <EkMenuPanel class="bo-account__menu" :groups="accountGroups" label="Hesap" @select="onAccountSelect" @close="accountOpen = false" />
        </div>
      </v-menu>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { EkBrandLogo, EkKbd, EkMenuPanel, EkThemeSwitch, type EkMenuGroup, type EkMenuItem } from '@entegrasyonik/ui/components'
import StepUpIndicator from '@bo/components/shell/StepUpIndicator.vue'
import { currentEnv } from '@bo/utils/env'
import { session } from '@bo/auth/session'
import { CHAT_ICON, CHAT_PRODUCT } from '@entegrasyonik/chat/brand'
import { otopilot } from '@bo/chat/otopilot'
import { setThemePreference, themePreference } from '@bo/theme'
import { formatDateTime, formatRelative } from '@bo/utils/format'

defineProps<{ menuOpen: boolean; compact: boolean }>()
const emit = defineEmits<{ 'toggle-menu': []; logout: []; 'open-palette': [] }>()

const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

const user = computed(() => session.state.user)
const initials = computed(() =>
  (user.value?.name ?? '')
    .split(/\s+/)
    .slice(-2)
    .map((w) => w.charAt(0))
    .join('')
    .toLocaleUpperCase('tr-TR'),
)
const env = currentEnv
const otopilotHint = computed(() => (otopilot.panelOpen.value ? `${CHAT_PRODUCT.name} panelini kapat` : `${CHAT_PRODUCT.name} — salt okuma`))

// Hesap menüsü uygulamadaki gibi: kimlik başlığı + tema anahtarı + EkMenuPanel (tehlikeli öğe en sonda).
const accountOpen = ref(false)
const accountGroups: EkMenuGroup[] = [{ items: [{ key: 'logout', label: 'Çıkış yap', icon: 'mdi-logout', danger: true }] }]
function onAccountSelect(item: EkMenuItem) {
  accountOpen.value = false
  if (item.key === 'logout') emit('logout')
}
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
  /* Uygulama üst barıyla aynı ton (EkAppHeader `tone="soft"`): chrome rolleri chrome-soft'a bağlanır. */
  --ek-gradient-chrome: var(--ek-gradient-chrome-soft);
  --ek-color-chrome: var(--ek-color-chrome-soft);
  --ek-color-chrome-end: var(--ek-color-chrome-soft-end);
  --ek-color-chrome-raised: var(--ek-color-chrome-soft-raised);
  --ek-color-chrome-border: var(--ek-color-chrome-soft-border);
  --ek-color-chrome-text-muted: var(--ek-color-chrome-soft-text-muted);
}

.bo-top__tip {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
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
.bo-top__otopilot:focus-visible,
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
  color: var(--ek-color-chrome-text-muted);
  font-size: var(--ek-icon-lg);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.bo-top__otopilot {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--ek-space-2);
  height: var(--ek-control-h-md);
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-chrome-raised);
  color: var(--ek-color-chrome-text);
  font: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.bo-top__otopilot.is-compact {
  justify-content: center;
  width: var(--ek-control-h-md);
  padding: 0;
}

.bo-top__otopilot:hover,
.bo-top__otopilot.is-active {
  border-color: var(--ek-color-chrome-text-muted);
}

.bo-top__icon-btn:hover {
  background: var(--ek-color-chrome-raised);
  color: var(--ek-color-chrome-text);
}

.bo-top__user:hover {
  background: var(--ek-color-chrome-raised);
}

.bo-top__user {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  height: var(--ek-control-h-md);
  padding: 0 var(--ek-space-2) 0 var(--ek-space-1);
  border: 1px solid transparent;
  border-radius: var(--ek-radius-chip);
  background: transparent;
  color: var(--ek-color-chrome-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

/* Avatar yuvarlak, kabuğun kontrol tonunda (uygulama profiliyle aynı; koyu blok yok). */
.bo-top__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--ek-color-chrome-raised);
  color: var(--ek-color-chrome-text);
  box-shadow: inset 0 0 0 1px var(--ek-color-chrome-border);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-bold);
}

.bo-top__user-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
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

.bo-top__user-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ek-color-chrome-text-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-top__chevron {
  color: var(--ek-color-chrome-text-muted);
  font-size: var(--ek-icon-md);
}

/* Hesap menüsü — uygulamadaki `.ek-shell-account` ile aynı yapı. */
.bo-account {
  min-width: 280px;
  overflow: hidden;
  background: var(--ek-color-surface-raised);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-popover);
  box-shadow: var(--ek-shadow-popover);
}

.bo-account__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-surface-muted);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.bo-account__avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-bold);
}

.bo-account__who {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.bo-account__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.bo-account__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-account__facts {
  display: grid;
  gap: var(--ek-space-1);
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.bo-account__facts div {
  display: flex;
  justify-content: space-between;
  gap: var(--ek-space-3);
  font-size: var(--ek-type-label-size);
}

.bo-account__facts dt {
  color: var(--ek-color-content-muted);
}

.bo-account__facts dd {
  margin: 0;
  color: var(--ek-color-content-strong);
}

.bo-account__theme {
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.bo-account__menu {
  border: 0;
  border-radius: 0;
  box-shadow: none;
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

/* MOB-06: telefon — her hedef 44 × 44, aralık sıfır (görsel boşluğu hedefin iç dolgusu verir). */
@media (max-width: 599.98px) {
  .bo-top,
  .bo-top__start,
  .bo-top__end {
    gap: 0;
  }

  .bo-top__icon-btn,
  .bo-top__search.is-compact {
    width: 44px;
    height: 44px;
  }

  .bo-top__brand {
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
  }

  .bo-top__user {
    flex: none;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border-color: transparent;
    background: transparent;
  }

  /* Ortam rozeti etkileşimsiz: görsel boyu sabit kalır. Örnek veri/yerel yalnız ikon (ad ekran okuyucuda);
     staging/üretim etiketi her zaman görünür. */
  .bo-top__env {
    height: 28px;
    margin-inline: var(--ek-space-1);
  }

  .bo-top__otopilot {
    width: 44px;
    height: 44px;
    padding: 0;
  }

  .bo-top__env.is-mock,
  .bo-top__env.is-local {
    padding: 0 var(--ek-space-2);
  }

  .bo-top__env.is-mock > span:not(.ek-sr-only),
  .bo-top__env.is-local > span:not(.ek-sr-only) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}

/* 360–399 px staging/üretim: etiketli ortam rozeti + renkli şerit kimliği taşır; marka işareti yer açar
   (genel bakışa çekmece menüsünden gidilir). */
@media (max-width: 399.98px) {
  .bo-top.env-staging .bo-top__brand,
  .bo-top.env-production .bo-top__brand {
    display: none;
  }
}

@media (max-width: 1199px) {
  .bo-top__search:not(.is-compact) {
    flex-basis: 280px;
  }
}

/* ================= BO-LOCAL-01 — üst bar: uygulamanın tasarım diliyle (DESIGN_SYSTEM §35 D7) =================
   Degrade ve gölge yok: DÜZ lacivert + altta ince çizgi. Düğmeler çerçeveli KÖŞELİ kutular (hap / daire yok); ortam
   etiketi ve Otopilot girişi köşeli; hesap menüsü kart köşeli, başlık bandı sakin zeminde. Ortam uyarısı (staging /
   production) üstteki ince renkli çizgiyle kalır (güvenlik işareti). */
.bo-top {
  background: var(--ek-color-chrome-soft);
  box-shadow: inset 0 -1px 0 var(--ek-color-chrome-soft-border);
}

.bo-top.env-staging {
  box-shadow: inset 0 3px 0 var(--ek-color-warning), inset 0 -1px 0 var(--ek-color-chrome-soft-border);
}

.bo-top.env-production {
  box-shadow: inset 0 3px 0 var(--ek-color-error), inset 0 -1px 0 var(--ek-color-chrome-soft-border);
}

.bo-top__env,
.bo-top__otopilot,
.bo-top__user,
.bo-top__search,
.bo-top__icon-btn {
  border-radius: var(--ek-radius-tile);
}

.bo-top__icon-btn {
  border: 1px solid var(--ek-color-chrome-border);
  background: var(--ek-color-chrome-raised);
}

.bo-top__icon-btn:hover {
  border-color: var(--ek-color-chrome-text-muted);
}

/* Otopilot girişi: barın tek vurgulu öğesi — dolu eylem rengi; açıkken "basılı" (beyaz zemin + eylem metni). */
.bo-top__otopilot {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-top__otopilot:hover {
  border-color: var(--ek-color-action-contrast);
}

.bo-top__otopilot.is-active {
  border-color: var(--ek-color-action-contrast);
  background: var(--ek-color-action-contrast);
  color: var(--ek-color-action);
}

.bo-top__avatar {
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
  box-shadow: none;
}

.bo-account {
  border-color: var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.bo-account__head {
  border-bottom: 1px solid var(--ek-color-border-default);
}

.bo-account__avatar {
  border-radius: var(--ek-radius-tile);
}
</style>
