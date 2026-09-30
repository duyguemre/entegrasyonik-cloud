<!--
  frontend/src/components/layout/ShellSubscriptionBanner.vue

  C2.2 — kabukta abonelik durum bandı (F-16 FE kısmı). Üst barın altında, sekme şeridinin üstünde
  tam çalışma alanı genişliğinde ince bir şerit. Veri `stores/subscriptionBanner.ts`'ten; hangi
  durumda hangi metin/ton gösterileceği saf `resolveSubscriptionBanner`'da (composables/subscriptionStatus.ts).

  Ton = anlam (DESIGN_SYSTEM §2.3): info (deneme son günleri, dönem içi iptal) · warning (ödeme
  gecikti) · danger → `error` rolü (stok senkronu durdu). Renk tek başına anlam taşımaz: ikon + başlık.
  Kapatılamaz (kritik). Yalnız info tonlu deneme bandı oturum içinde küçültülebilir.
  `compact`: tek satır (küçültülmüş deneme bandı ve odak modu — kritik bilgi odak modunda da kalır).
  Erişilebilirlik: bölge (`aria-label`) + metin `role=status` (aria-live polite, ADR-0015 5.7) —
  sayfa açılışında araya giren bir alarm değil; ton değişince yeni metin okunur.
-->
<template>
  <section
    class="ek-sub-banner"
    :class="[`ek-sub-banner--${model.tone}`, { 'is-compact': isCompact }]"
    :aria-label="t('subscriptionBanner.regionLabel')"
    data-testid="subscription-banner"
    :data-status="model.status"
    :data-tone="model.tone"
  >
    <EkIconTile v-if="!isCompact" class="ek-sub-banner__tile" :icon="model.icon" :tone="tileTone" size="sm" />
    <v-icon v-else class="ek-sub-banner__icon" :icon="model.icon" aria-hidden="true" />

    <p class="ek-sub-banner__text" role="status">
      <strong class="ek-sub-banner__title">{{ model.title }}</strong>
      <span class="ek-sub-banner__sep" aria-hidden="true">·</span>
      <span class="ek-sub-banner__message">{{ message }}</span>
    </p>

    <div class="ek-sub-banner__actions">
      <EkButton
        v-if="canManage"
        class="ek-sub-banner__manage"
        :tone="isCompact ? 'ghost' : 'secondary'"
        size="sm"
        icon="mdi-credit-card-outline"
        :aria-label="t('subscriptionBanner.manage')"
        @click="$emit('manage')"
      >
        <span class="ek-sub-banner__manage-long">{{ t('subscriptionBanner.manage') }}</span>
        <span class="ek-sub-banner__manage-short" aria-hidden="true">{{ t('subscriptionBanner.manageShort') }}</span>
      </EkButton>
      <EkTooltip v-if="model.minimizable && !forceCompact" :text="toggleLabel">
        <EkButton
          class="ek-sub-banner__toggle"
          tone="ghost"
          size="sm"
          icon-only
          :icon="minimized ? 'mdi-chevron-down' : 'mdi-chevron-up'"
          :aria-label="toggleLabel"
          :aria-expanded="!minimized"
          @click="$emit('update:minimized', !minimized)"
        />
      </EkTooltip>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import EkButton from '@/components/ds/EkButton.vue'
import EkIconTile from '@/components/ds/EkIconTile.vue'
import EkTooltip from '@/components/ds/EkTooltip.vue'
import type { SubscriptionBannerModel } from '@/composables/subscriptionStatus'

const props = withDefaults(
  defineProps<{
    model: SubscriptionBannerModel
    /** Kullanıcı deneme bandını küçülttü mü (yalnız `model.minimizable` iken anlamlı). */
    minimized?: boolean
    /** Odak modu: tüm bantlar tek satır; küçült/genişlet düğmesi gizli. */
    forceCompact?: boolean
    /** Abonelik ekranı kullanıcının menüsünde yoksa "Aboneliği yönet" gösterilmez. */
    canManage?: boolean
  }>(),
  { minimized: false, forceCompact: false, canManage: true },
)

defineEmits<{
  manage: []
  'update:minimized': [value: boolean]
}>()

const { t } = useI18n()

const isCompact = computed(() => props.forceCompact || (props.model.minimizable && props.minimized))
const tileTone = computed(() => (props.model.tone === 'danger' ? 'error' : props.model.tone))
const message = computed(() => {
  const key = isCompact.value ? `subscriptionBanner.compact.${props.model.messageKey}` : `subscriptionBanner.${props.model.messageKey}`
  return t(key, props.model.params)
})
const toggleLabel = computed(() => t(props.minimized ? 'subscriptionBanner.expand' : 'subscriptionBanner.minimize'))
</script>

<style scoped>
.ek-sub-banner {
  --ek-sub-bg: var(--ek-color-info-subtle);
  --ek-sub-border: var(--ek-color-info-border);
  --ek-sub-accent: var(--ek-color-info);
  --ek-sub-ink: var(--ek-color-info-emphasis);
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: var(--ek-app-row-h);
  padding: var(--ek-space-1) var(--ek-space-4) var(--ek-space-1) var(--ek-space-3);
  background: var(--ek-sub-bg);
  border-bottom: 1px solid var(--ek-sub-border);
  box-shadow: inset 3px 0 0 var(--ek-sub-accent);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-sub-banner--warning {
  --ek-sub-bg: var(--ek-color-warning-subtle);
  --ek-sub-border: var(--ek-color-warning-border);
  --ek-sub-accent: var(--ek-color-warning);
  --ek-sub-ink: var(--ek-color-warning-emphasis);
}

.ek-sub-banner--danger {
  --ek-sub-bg: var(--ek-color-error-subtle);
  --ek-sub-border: var(--ek-color-error-border);
  --ek-sub-accent: var(--ek-color-error);
  --ek-sub-ink: var(--ek-color-error-emphasis);
}

.ek-sub-banner__tile {
  flex: 0 0 auto;
}

.ek-sub-banner__icon {
  flex: 0 0 auto;
  font-size: var(--ek-icon-sm);
  color: var(--ek-sub-accent);
}

.ek-sub-banner__text {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
}

.ek-sub-banner__title {
  color: var(--ek-sub-ink);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-sub-banner__sep {
  margin: 0 var(--ek-space-2);
  color: var(--ek-sub-ink);
}

.ek-sub-banner__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.ek-sub-banner__manage-short {
  display: none;
}

.ek-sub-banner__toggle {
  color: var(--ek-sub-ink);
}

/* Tek satır: küçültülmüş deneme bandı / odak modu. Metin taşarsa … ile kesilir (tam metin ekranda). */
.ek-sub-banner.is-compact {
  min-height: var(--ek-control-h-sm);
  padding-top: 0;
  padding-bottom: 0;
  gap: var(--ek-space-2);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-sub-banner.is-compact .ek-sub-banner__text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ek-sub-banner.is-compact .ek-sub-banner__manage {
  color: var(--ek-sub-ink);
}

/* Dar ekran: ikon + metin üstte (sarar), eylemler metnin altında sağa yaslı değil — metinle aynı hizada
   akar; düğme kısa etiket ("Yönet"). Tek satırlık kip dar ekranda da tek satır kalır. */
@media (max-width: 767px) {
  .ek-sub-banner:not(.is-compact) {
    flex-wrap: wrap;
    align-items: flex-start;
    row-gap: var(--ek-space-2);
    padding-top: var(--ek-space-2);
    padding-bottom: var(--ek-space-2);
  }

  .ek-sub-banner:not(.is-compact) .ek-sub-banner__text {
    flex-basis: calc(100% - var(--ek-space-10));
  }

  .ek-sub-banner:not(.is-compact) .ek-sub-banner__actions {
    margin-left: calc(var(--ek-space-3) + var(--ek-space-8) - var(--ek-space-1));
  }

  .ek-sub-banner__manage-long {
    display: none;
  }

  .ek-sub-banner__manage-short {
    display: inline;
  }

  .ek-sub-banner__sep {
    display: none;
  }

  .ek-sub-banner:not(.is-compact) .ek-sub-banner__title {
    display: block;
  }
}
</style>
