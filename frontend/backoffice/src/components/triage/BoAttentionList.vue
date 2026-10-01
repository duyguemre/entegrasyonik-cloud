<!--
  BoAttentionList — KARAR (BO_UI_PATTERNS §11.2). "Müdahale etmeli miyim?" sorusunun cevabı: önem sırasına dizili maddeler.
  Her madde üç soruyu aynı sırayla yanıtlar: NE OLDU (başlık) · NE KADAR CİDDİ (önem rozeti + etki + ne zamandan beri) ·
  NE YAPMALIYIM (öneri) + TEK TIKLA EYLEM (hedef ekran, süzgeç uygulanmış). Boşsa "her şey yolunda" durumunu neyin
  denetlendiğiyle birlikte sakin biçimde çizer. Okunamayan kaynak varsa listenin eksik olabileceğini söyler.

    <BoAttentionList :items="items" :state="state" :error="error" :checks="['Kuyruklar', 'Devre kesiciler']"
      ok-title="Sistem tarafında müdahale gereken bir şey yok" list-label="Sistemde dikkat isteyenler" @retry="load" />
-->
<template>
  <div class="bo-al">
    <BoPanelState v-if="state === 'loading'" state="loading" :rows="3" />
    <BoPanelState v-else-if="state === 'error'" state="error" :error="error" :error-text="errorText" :retrying="retrying" @retry="$emit('retry')" />
    <div v-else-if="state === 'unsupported'" class="bo-al__unsupported" data-testid="attention-unsupported">
      <v-icon icon="mdi-progress-clock" aria-hidden="true" />
      <div>
        <p class="bo-al__ok-title">{{ unsupportedTitle }}</p>
        <p class="bo-al__ok-text">{{ unsupportedText }}</p>
        <slot name="unsupported" />
      </div>
    </div>
    <template v-else>
      <p v-if="degraded.length" class="bo-al__degraded" data-testid="attention-degraded">
        <v-icon icon="mdi-lan-disconnect" aria-hidden="true" />
        <span><strong>{{ degraded.join(', ') }}</strong> okunamadı — liste eksik olabilir.</span>
        <button type="button" class="bo-link-btn" @click="$emit('retry')">Yeniden dene</button>
      </p>
      <div v-if="!items.length" class="bo-al__ok" data-testid="attention-ok">
        <v-icon icon="mdi-check-circle-outline" aria-hidden="true" />
        <div>
          <p class="bo-al__ok-title">{{ okTitle }}</p>
          <p v-if="okText" class="bo-al__ok-text">{{ okText }}</p>
          <p v-if="checks.length" class="bo-al__checks"><span class="bo-al__checks-k">Denetlenen</span> {{ checks.join(' · ') }}</p>
        </div>
      </div>
      <ol v-else class="bo-al__list" :aria-label="listLabel" data-testid="attention-list">
        <li v-for="it in visible" :key="it.id" class="bo-al__item" :class="`is-${it.severity}`" :data-severity="it.severity">
          <span class="bo-al__sev" aria-hidden="true"><v-icon :icon="SEVERITY[it.severity].icon" /></span>
          <div class="bo-al__body">
            <component :is="`h${headingLevel}`" class="bo-al__title">
              <span class="ek-sr-only">{{ SEVERITY[it.severity].label }}: </span>{{ it.title }}
            </component>
            <p class="bo-al__meta">
              <EkStatusChip class="bo-al__chip" :tone="SEVERITY[it.severity].tone" :label="SEVERITY[it.severity].label" />
              <RouterLink v-if="it.tenant" class="bo-al__tenant" :to="{ name: 'tenant', params: { tid: String(it.tenant.tid) } }">
                <span class="bo-id">#{{ it.tenant.tid }}</span><span v-if="it.tenant.name" class="bo-al__tenant-name">{{ it.tenant.name }}</span>
              </RouterLink>
              <span v-if="it.since" class="bo-al__since"><EkRelativeTime :value="it.since" /> başladı</span>
            </p>
            <p class="bo-al__impact">{{ it.impact }}</p>
            <p class="bo-al__advice"><span class="bo-al__advice-k">Ne yapmalı</span>{{ it.advice }}</p>
            <div class="bo-al__actions">
              <RouterLink :to="it.action.to" class="bo-act-link" :class="{ 'is-primary': it.severity === 'critical' }" data-testid="attention-action">
                {{ it.action.label }}<v-icon icon="mdi-arrow-right" aria-hidden="true" />
              </RouterLink>
              <RouterLink v-if="it.secondary" :to="it.secondary.to" class="bo-al__secondary">{{ it.secondary.label }}</RouterLink>
            </div>
          </div>
        </li>
      </ol>
      <button v-if="hiddenCount > 0" type="button" class="bo-al__more" :aria-expanded="expanded" @click="expanded = true">
        {{ hiddenCount }} madde daha göster <span class="bo-al__more-hint">({{ hiddenText }})</span>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { EkRelativeTime, EkStatusChip } from '@entegrasyonik/ui/components'
import BoPanelState from '@bo/components/shell/BoPanelState.vue'
import '@bo/styles/kit.css'
import { SEVERITY, countText, type AttentionEntry } from './triage'

export type AttentionState = 'loading' | 'ready' | 'error' | 'unsupported'

const props = withDefaults(
  defineProps<{
    items: AttentionEntry[]
    state: AttentionState
    error?: unknown
    errorText?: string
    retrying?: boolean
    /** İlk görünen madde sayısı; kalanı "N madde daha" ile açılır (kritikler her zaman görünür). */
    limit?: number
    listLabel?: string
    okTitle?: string
    okText?: string
    /** "Her şey yolunda" durumunda neyin denetlendiği (Türkçe adlar). */
    checks?: string[]
    /** Okunamayan kaynaklar → "liste eksik olabilir" notu. */
    degraded?: string[]
    unsupportedTitle?: string
    unsupportedText?: string
    headingLevel?: 3 | 4
  }>(),
  {
    limit: 5,
    listLabel: 'Dikkat isteyen maddeler',
    okTitle: 'Müdahale gereken bir şey yok',
    checks: () => [],
    degraded: () => [],
    unsupportedTitle: 'Bu bölüm henüz bağlı değil',
    unsupportedText: 'Sunucu bu özeti henüz sağlamıyor.',
    headingLevel: 3,
  },
)
defineEmits<{ retry: [] }>()

const expanded = ref(false)
const shown = computed(() => (expanded.value ? props.items.length : Math.max(props.limit, props.items.filter((i) => i.severity === 'critical').length)))
const visible = computed(() => props.items.slice(0, shown.value))
const hiddenCount = computed(() => props.items.length - visible.value.length)
const hiddenText = computed(() => countText(props.items.slice(shown.value)))
</script>

<style scoped>
.bo-al__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.bo-al__item {
  --bo-al-accent: var(--ek-color-info);
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) 0;
}

.bo-al__item + .bo-al__item {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.bo-al__item.is-critical {
  --bo-al-accent: var(--ek-color-error-emphasis);
}

.bo-al__item.is-warning {
  --bo-al-accent: var(--ek-color-warning-emphasis);
}

.bo-al__sev {
  display: inline-flex;
  justify-content: center;
  padding-top: 1px;
  color: var(--bo-al-accent);
  font-size: var(--ek-icon-md);
}

.bo-al__body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.bo-al__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
  line-height: var(--ek-type-body-line);
}

.bo-al__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-3);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-al__tenant {
  display: inline-flex;
  align-items: baseline;
  gap: var(--ek-space-1);
  max-width: 100%;
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-content-default);
  text-decoration: none;
}

.bo-al__tenant:hover .bo-al__tenant-name {
  text-decoration: underline;
}

.bo-al__tenant:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-al__tenant-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bo-al__impact {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}

.bo-al__advice {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}

.bo-al__advice-k,
.bo-al__checks-k {
  margin-right: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-al__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-4);
  margin-top: var(--ek-space-1);
}

.bo-al__secondary {
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  text-decoration: none;
}

.bo-al__secondary:hover {
  text-decoration: underline;
}

.bo-al__secondary:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-al__ok,
.bo-al__unsupported {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-2) 0;
}

.bo-al__ok > .v-icon {
  color: var(--ek-color-success);
  font-size: var(--ek-icon-lg);
}

.bo-al__unsupported > .v-icon {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-lg);
}

.bo-al__ok-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-al__ok-text,
.bo-al__checks {
  margin: 2px 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}

.bo-al__degraded {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-warning-border);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
  font-size: var(--ek-type-label-size);
}

.bo-al__degraded > span {
  flex: 1;
  color: var(--ek-color-content-default);
}

.bo-al__more {
  margin-top: var(--ek-space-2);
  padding: var(--ek-space-1) 0;
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: var(--ek-color-action-emphasis);
  font: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
}

.bo-al__more:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-al__more-hint {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular);
}
</style>
