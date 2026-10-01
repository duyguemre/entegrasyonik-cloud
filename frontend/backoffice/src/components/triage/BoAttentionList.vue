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
      <ol v-else ref="listEl" class="bo-al__list" :aria-label="listLabel" data-testid="attention-list">
        <li
          v-for="(it, i) in visible"
          :key="it.id"
          class="bo-al__item"
          :class="[`is-${it.severity}`, { 'is-compact': compact }]"
          :data-severity="it.severity"
          :tabindex="i === revealFrom ? -1 : undefined"
        >
          <span class="bo-al__sev" aria-hidden="true"><v-icon :icon="SEVERITY[it.severity].icon" /></span>
          <div class="bo-al__body">
            <component :is="`h${headingLevel}`" class="bo-al__title">{{ it.title }}</component>
            <p class="bo-al__meta">
              <span class="bo-al__sevtext">{{ SEVERITY[it.severity].label }}</span>
              <span v-if="it.count" class="bo-al__count ek-num">{{ it.count }}</span>
              <span v-if="it.since" class="bo-al__since"><EkRelativeTime :value="it.since" /> başladı</span>
            </p>
            <p v-if="!compact && (it.why || it.impact)" class="bo-al__why">{{ [it.why, it.impact].filter(Boolean).join(' ') }}</p>
            <ul v-if="it.subjects?.length" class="bo-al__subjects" :aria-label="`Etkilenen müşteriler: ${it.title}`">
              <li v-for="s in it.subjects.slice(0, 3)" :key="s.tid">
                <RouterLink class="bo-al__tenant" :to="{ name: 'tenant', params: { tid: String(s.tid) } }">
                  <span class="bo-id">#{{ s.tid }}</span><span v-if="s.name" class="bo-al__tenant-name">{{ s.name }}</span>
                </RouterLink>
              </li>
              <li v-if="it.subjects.length > 3" class="bo-al__subjects-more">+{{ it.subjects.length - 3 }} müşteri</li>
            </ul>
            <p v-if="!compact && it.advice" class="bo-al__advice"><span class="bo-al__advice-k">Ne yapmalı</span>{{ it.advice }}</p>
            <div v-if="it.action || it.secondary || it.capabilities?.length || (compact && (it.why || it.impact || it.advice))" class="bo-al__actions">
              <RouterLink v-if="it.action" :to="it.action.to" class="bo-act-link" :class="{ 'is-primary': it.severity === 'critical' }" data-testid="attention-action">
                {{ it.action.label }}<v-icon icon="mdi-arrow-right" aria-hidden="true" />
              </RouterLink>
              <RouterLink v-if="it.secondary" :to="it.secondary.to" class="bo-al__secondary">{{ it.secondary.label }}</RouterLink>
              <template v-if="!compact">
                <span v-for="c in it.capabilities ?? []" :key="c.capabilityId" class="bo-al__cap" :title="`${c.label}: ilgili ekranda kimlik doğrulama ve gerekçeyle yapılır`">
                  <v-icon icon="mdi-shield-lock-outline" aria-hidden="true" />{{ c.label }} — ekranda, gerekçeyle
                </span>
              </template>
              <!-- BO2-P1: yoğun panoda (compact) açıklama ikinci planda — ne oldu / ne kadar ciddi / eylem görünür kalır. -->
              <BoCollapsible v-if="compact && (it.why || it.impact || it.advice || it.capabilities?.length)" class="bo-al__more-detail" inline label="Neden ve ne yapmalı" open-label="Açıklamayı gizle">
                <p v-if="it.why || it.impact" class="bo-al__why">{{ [it.why, it.impact].filter(Boolean).join(' ') }}</p>
                <p v-if="it.advice" class="bo-al__advice"><span class="bo-al__advice-k">Ne yapmalı</span>{{ it.advice }}</p>
                <span v-for="c in it.capabilities ?? []" :key="c.capabilityId" class="bo-al__cap">
                  <v-icon icon="mdi-shield-lock-outline" aria-hidden="true" />{{ c.label }} — ekranda, gerekçeyle
                </span>
              </BoCollapsible>
            </div>
          </div>
        </li>
      </ol>
      <p v-if="total > items.length" class="bo-al__truncated">Toplam {{ total }} maddenin en önemli {{ items.length }} tanesi gösteriliyor.</p>
      <button v-if="hiddenCount > 0" type="button" class="bo-al__more" :aria-expanded="expanded" @click="showMore">
        {{ hiddenCount }} madde daha göster <span class="bo-al__more-hint">({{ hiddenText }})</span>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { EkRelativeTime } from '@entegrasyonik/ui/components'
import BoPanelState from '@bo/components/shell/BoPanelState.vue'
import BoCollapsible from '@bo/components/r2/BoCollapsible.vue'
import '@bo/styles/kit.css'
import { SEVERITY, countText, type AttentionEntry } from './triage'

export type AttentionState = 'loading' | 'ready' | 'error' | 'unsupported'

const props = withDefaults(
  defineProps<{
    items: AttentionEntry[]
    /** Sunucudaki toplam (kesmeden önce); `items`'tan büyükse "en önemli N" notu. */
    total?: number
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
    /** BO2-P1: yoğun pano — açıklama ve öneri "Neden ve ne yapmalı" altında katlanır. */
    compact?: boolean
  }>(),
  {
    total: 0,
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

// bo-wdg: "N madde daha göster" tıklanınca kaybolur → odak ilk yeni maddeye (programla odaklanır, sekme sırasına girmez).
const listEl = ref<HTMLOListElement | null>(null)
const revealFrom = ref<number | null>(null)
function showMore() {
  revealFrom.value = visible.value.length
  expanded.value = true
  void nextTick(() => (listEl.value?.children[revealFrom.value!] as HTMLElement | undefined)?.focus())
}
</script>

<style scoped>
.bo-al__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.bo-al__item:focus {
  outline: none;
}

.bo-al__item:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
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

.bo-al__sevtext {
  color: var(--bo-al-accent);
  font-weight: var(--ek-font-weight-semibold);
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
.bo-al__why {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}

.bo-al__count {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-al__subjects {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1) var(--ek-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--ek-type-caption-size);
}

.bo-al__subjects-more {
  color: var(--ek-color-content-muted);
}

.bo-al__cap {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-al__cap .v-icon {
  font-size: var(--ek-icon-sm);
}

.bo-al__truncated {
  margin: var(--ek-space-2) 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

/* BO2-P1 yoğun pano: madde başlık + önem + eylem; açıklama katlanır. */
.bo-al__item.is-compact {
  padding: var(--ek-space-3) 0;
}

.bo-al__item.is-compact .bo-al__actions {
  margin-top: var(--ek-space-1);
}

.bo-al__more-detail :deep(.bo-collapse__body) {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}
</style>
