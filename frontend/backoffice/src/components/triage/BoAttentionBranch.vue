<!--
  BoAttentionBranch — müdahale kutusunun (BoVerdictCard) bir DALI (genel bakışta Sistem / Müşteriler; sayfalarda
  "Dikkat isteyenler"). Ayrı kart değil; kutunun ayraçlı satırıdır.
  Kapalı başlar: başlık + önem rozetleri + en büyük sorunun adı (tek bakış). Açınca önem sırasına dizili tek satırlık
  maddeler; maddeye tıklayınca YERİNDE ayrıntı (neden, ne yapmalı, etkilenen müşteriler, ilgili ekrana geçiş).
-->
<template>
  <section class="ov-scope" :class="`is-${health}`" :aria-labelledby="`${id}-t`" :data-testid="`triage-${id}`">
    <button type="button" class="ov-scope__head" :aria-expanded="expanded" :aria-controls="`${id}-body`" @click="expanded = !expanded">
      <v-icon class="ov-scope__chev" icon="mdi-chevron-right" aria-hidden="true" />
      <v-icon class="ov-scope__icon" :icon="icon" aria-hidden="true" />
      <span :id="`${id}-t`" class="ov-scope__title" role="heading" aria-level="3">{{ title }}</span>
      <!-- Önem başına ayrı rozet: kritik kırmızımsı, uyarı sarımsı (tek rozette karışmaz). -->
      <span v-if="pills.length" class="ov-scope__answers" data-testid="triage-answer">
        <span v-for="pl in pills" :key="pl.label" class="ov-scope__answer" :class="`is-${pl.tone}`"><i aria-hidden="true"></i>{{ pl.label }}</span>
      </span>
      <span v-if="!expanded && preview" class="ov-scope__preview">{{ preview }}</span>
    </button>

    <div v-if="expanded" :id="`${id}-body`" class="ov-scope__body">

    <BoPanelState v-if="state === 'loading'" state="loading" :rows="3" />
    <BoPanelState v-else-if="state === 'error'" state="error" :error="error" :retrying="retrying" @retry="$emit('retry')" />
    <p v-else-if="state === 'unsupported'" class="ov-scope__calm" data-testid="attention-unsupported">
      <v-icon icon="mdi-progress-clock" aria-hidden="true" />
      <span><strong>Henüz bağlı değil.</strong> {{ unsupportedText }}</span>
    </p>
    <template v-else>
      <p v-if="degraded.length" class="ov-scope__degraded" data-testid="attention-degraded">
        <v-icon icon="mdi-lan-disconnect" aria-hidden="true" />
        <span><strong>{{ degraded.join(', ') }}</strong> okunamadı — liste eksik olabilir.</span>
        <button type="button" class="bo-link-btn" @click="$emit('retry')">Yeniden dene</button>
      </p>
      <p v-if="!sorted.length" class="ov-scope__calm is-ok" data-testid="attention-ok">
        <v-icon icon="mdi-check-circle-outline" aria-hidden="true" />
        <span>
          <strong>{{ okTitle }}</strong>
          <span v-if="checks.length" class="ov-scope__checks">Denetlenen: {{ checks.join(' · ') }}</span>
        </span>
      </p>
      <ol v-else class="ov-scope__list" :aria-label="`${title}: dikkat isteyenler`" data-testid="attention-list">
        <li v-for="it in visible" :key="it.id" class="ov-row" :class="[`is-${it.severity}`, { 'is-open': openId === it.id }]" :data-severity="it.severity">
          <button type="button" class="ov-row__line" :aria-expanded="openId === it.id" :aria-controls="`${id}-${it.id}`" @click="toggle(it.id)">
            <v-icon class="ov-row__sev" :icon="SEVERITY[it.severity].icon" aria-hidden="true" />
            <span class="ek-sr-only">{{ SEVERITY[it.severity].label }}: </span>
            <span class="ov-row__title">{{ it.title }}</span>
            <span v-if="it.count" class="ov-row__count ek-num">{{ it.count }}</span>
            <span v-if="it.since" class="ov-row__since"><EkRelativeTime :value="it.since" /></span>
            <v-icon class="ov-row__chev" icon="mdi-chevron-down" aria-hidden="true" />
          </button>
          <!-- Ayrıntı: etiket sütunu + içerik (taranabilir); "Ne yapmalı" vurgulu; eylemler altta. -->
          <div v-if="openId === it.id" :id="`${id}-${it.id}`" class="ov-detail">
            <dl class="ov-detail__grid">
              <template v-if="it.why">
                <dt>Ne oldu</dt>
                <dd class="ov-detail__text">{{ it.why }}</dd>
              </template>
              <template v-if="it.impact">
                <dt>Etki</dt>
                <dd class="ov-detail__text">{{ it.impact }}</dd>
              </template>
              <template v-if="it.since || it.count">
                <dt>Durum</dt>
                <dd class="ov-detail__facts">
                  <span v-if="it.since" class="ov-detail__fact"><v-icon icon="mdi-clock-outline" aria-hidden="true" /><EkRelativeTime :value="it.since" /> başladı</span>
                  <span v-if="it.count" class="ov-detail__fact"><v-icon icon="mdi-counter" aria-hidden="true" /><b class="ek-num">{{ it.count }}</b></span>
                  <span class="ov-detail__fact"><v-icon :icon="SEVERITY[it.severity].icon" aria-hidden="true" />{{ SEVERITY[it.severity].label }}</span>
                </dd>
              </template>
              <template v-if="it.subjects?.length">
                <dt>Müşteriler</dt>
                <dd>
                  <ul class="ov-detail__tenants" :aria-label="`Etkilenen müşteriler: ${it.title}`">
                    <li v-for="s in (it.subjects ?? []).slice(0, 5)" :key="s.tid">
                      <RouterLink class="ov-detail__tenant" :to="{ name: 'tenant', params: { tid: String(s.tid) } }">
                        <span class="bo-id">#{{ s.tid }}</span><span v-if="s.name" class="ov-detail__tenant-name">{{ s.name }}</span>
                      </RouterLink>
                    </li>
                    <li v-if="(it.subjects?.length ?? 0) > 5" class="ov-detail__more">+{{ (it.subjects?.length ?? 0) - 5 }}</li>
                  </ul>
                </dd>
              </template>
              <template v-if="it.capabilities?.length">
                <dt>Güvenli işlem</dt>
                <dd class="ov-detail__caps">
                  <span v-for="c in it.capabilities ?? []" :key="c.capabilityId" class="ov-detail__cap">
                    <v-icon icon="mdi-shield-lock-outline" aria-hidden="true" />{{ c.label }}<span class="ov-detail__cap-note">ilgili ekranda, gerekçeyle</span>
                  </span>
                </dd>
              </template>
            </dl>
            <p v-if="it.advice" class="ov-detail__advice">
              <v-icon icon="mdi-lightbulb-on-outline" aria-hidden="true" />
              <span><span class="ov-detail__advice-k">Ne yapmalı</span>{{ it.advice }}</span>
            </p>
            <div v-if="it.action || it.secondary" class="ov-detail__actions">
              <RouterLink v-if="it.action" :to="it.action.to" class="bo-act-link" :class="{ 'is-primary': it.severity === 'critical' }" data-testid="attention-action">
                {{ it.action.label }}<v-icon icon="mdi-arrow-right" aria-hidden="true" />
              </RouterLink>
              <RouterLink v-if="it.secondary" :to="it.secondary.to" class="ov-detail__secondary">{{ it.secondary.label }}</RouterLink>
            </div>
          </div>
        </li>
      </ol>
      <button v-if="hidden.length" type="button" class="ov-scope__expand" @click="all = true">
        {{ hidden.length }} madde daha <span class="ov-scope__expand-hint">({{ countText(hidden) }})</span>
      </button>
      <button v-else-if="all && sorted.length > limit" type="button" class="ov-scope__expand" @click="all = false">Daha az göster</button>
      <p v-if="total > sorted.length" class="ov-scope__truncated">Toplam {{ total }} maddenin en önemli {{ sorted.length }} tanesi.</p>
    </template>
    <RouterLink v-if="more" :to="more.to" class="ov-scope__more">{{ more.label }} ekranında tümü<v-icon icon="mdi-arrow-right" aria-hidden="true" /></RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { EkRelativeTime } from '@entegrasyonik/ui/components'
import BoPanelState from '@bo/components/shell/BoPanelState.vue'
import { SEVERITY, countText, type AttentionEntry, type Health } from './triage'
import type { AttentionState } from './BoAttentionList.vue'
import '@bo/styles/kit.css'

const props = withDefaults(
  defineProps<{
    id: string
    title: string
    icon: string
    items: AttentionEntry[]
    health: Health
    answer?: string
    state: AttentionState
    error?: unknown
    retrying?: boolean
    total?: number
    checks?: string[]
    degraded?: string[]
    okTitle: string
    unsupportedText?: string
    more?: { label: string; to: RouteLocationRaw }
    /** İlk görünen madde sayısı (kritikler her zaman görünür). */
    limit?: number
  }>(),
  { total: 0, checks: () => [], degraded: () => [], limit: 3, unsupportedText: '' },
)
defineEmits<{ retry: [] }>()

const RANK = { critical: 0, warning: 1, info: 2 } as const
/** En büyük taş önce: önem sırası (aynı önemde sunucu sırası korunur). */
const pills = computed<Array<{ tone: Health; label: string }>>(() => {
  const c = props.items.filter((i) => i.severity === 'critical').length
  const w = props.items.filter((i) => i.severity === 'warning').length
  if (c || w) {
    const out: Array<{ tone: Health; label: string }> = []
    if (c) out.push({ tone: 'critical', label: `${c} kritik` })
    if (w) out.push({ tone: 'warning', label: `${w} uyarı` })
    return out
  }
  return props.answer ? [{ tone: props.health, label: props.answer }] : []
})

const sorted = computed(() => [...props.items].sort((a, b) => RANK[a.severity] - RANK[b.severity]))
const all = ref(false)
const shown = computed(() => (all.value ? sorted.value.length : Math.max(props.limit, sorted.value.filter((i) => i.severity === 'critical').length)))
const visible = computed(() => sorted.value.slice(0, shown.value))
const hidden = computed(() => sorted.value.slice(shown.value))

/** Dal kapalı başlar; kapalıyken en büyük sorunun adı tek bakışta görünür. */
const expanded = ref(false)
const preview = computed(() => {
  if (props.state !== 'ready') return ''
  const top = sorted.value[0]
  if (!top) return props.degraded.length ? `${props.degraded.join(', ')} okunamadı` : props.okTitle
  return sorted.value.length > 1 ? `${top.title} ve ${sorted.value.length - 1} konu daha` : top.title
})

const openId = ref<string | null>(null)
const toggle = (id: string) => (openId.value = openId.value === id ? null : id)
</script>

<style scoped>
/* Uyarı tonu panodan miras (`--ov-warn-*`: sarı dolgu, altın-koyu metin); yalnız başına kullanılırsa global uyarı. */
.ov-scope {
  --sc-warn-fill: var(--ov-warn-fill, var(--bo-warn-fill));
  --sc-warn-ink: var(--ov-warn-ink, var(--bo-warn-ink));
  --sc-tone: var(--ek-color-success);
  --sc-ink: var(--ek-color-success);
  --sc-pad: var(--ov-pad, 24px);
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* Dal başlığı: tüm satır tıklanır; kapalıyken en büyük sorunun adı sağa doğru sönük akar. */
.ov-scope__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: 100%;
  min-height: 52px;
  padding: 0 var(--sc-pad) 0 calc(var(--sc-pad) - 6px);
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ov-scope__head:hover {
  background: var(--ek-color-surface-muted);
}

.ov-scope__head:focus-visible {
  outline: none;
  box-shadow: inset var(--ek-focus-ring);
}

.ov-scope__chev {
  flex: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
  transition: transform var(--ek-motion-feedback);
}

.ov-scope__head[aria-expanded='true'] .ov-scope__chev {
  transform: rotate(90deg);
}

.ov-scope__preview {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-left: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}

/* Açık dal gövdesi başlık metnine hizalı (chevron + ikon girintisi). */
.ov-scope__body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: 0 var(--sc-pad) var(--ek-space-4) calc(var(--sc-pad) + 46px);
}

.ov-scope.is-warning {
  --sc-tone: var(--sc-warn-fill);
  --sc-ink: var(--sc-warn-ink);
}

.ov-scope.is-critical {
  --sc-tone: var(--ek-color-error);
  --sc-ink: var(--ek-color-error-emphasis);
}

.ov-scope.is-unknown {
  --sc-tone: var(--ek-color-content-subtle);
  --sc-ink: var(--ek-color-content-muted);
}

.ov-scope__icon {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: var(--ek-radius-md);
  background: color-mix(in srgb, var(--sc-tone) 16%, var(--ek-color-surface));
  color: var(--sc-ink);
  font-size: var(--ek-icon-sm);
}

.ov-scope__answers {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}

.ov-scope__answer {
  --pill: var(--ek-color-success);
  --pill-ink: var(--ek-color-success);
  --pill-wash: 10%;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 var(--ek-space-2);
  border: 1px solid color-mix(in srgb, var(--pill) 38%, var(--ek-color-border-subtle));
  border-radius: var(--ek-radius-chip);
  background: color-mix(in srgb, var(--pill) var(--pill-wash), var(--ek-color-surface));
  color: var(--pill-ink);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  white-space: nowrap;
}

.ov-scope__answer.is-critical {
  --pill: var(--ek-color-error);
  --pill-ink: var(--ek-color-error-emphasis);
  --pill-wash: 8%;
}

.ov-scope__answer.is-warning {
  --pill: var(--sc-warn-fill);
  --pill-ink: var(--sc-warn-ink);
  --pill-wash: 24%;
}

.ov-scope__answer.is-unknown {
  --pill: var(--ek-color-content-subtle);
  --pill-ink: var(--ek-color-content-muted);
}

.ov-scope__answer i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--pill);
}

.ov-scope__title {
  flex: none;
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.ov-scope__more {
  align-self: flex-start;
  margin: var(--ek-space-1) 0 0 var(--ek-space-2);
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
  text-decoration: none;
}

.ov-scope__more:hover {
  color: var(--ek-color-action-emphasis);
}

.ov-scope__more:focus-visible,
.ov-row__line:focus-visible,
.ov-scope__expand:focus-visible,
.ov-row__tenant:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ov-scope__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Satır: tek bakışta ne oldu · ne kadar · ne zamandan beri. Ayrıntı tıklayınca yerinde açılır. */
.ov-row {
  --ov-accent: var(--ek-color-info);
  border-radius: var(--ek-radius-md);
}

.ov-row + .ov-row {
  margin-top: 4px;
}

.ov-row.is-critical {
  --ov-accent: var(--ek-color-error-emphasis);
}

.ov-row.is-warning {
  --ov-accent: var(--sc-warn-ink);
}

/* Satır zemini önemine göre düz, hafif ton: kritik pembemsi, uyarı sarımsı, bilgi nötr. */
.ov-row.is-critical {
  background: color-mix(in srgb, var(--ek-color-error) 6%, var(--ek-color-surface));
}

.ov-row.is-warning {
  background: var(--bo-warn-wash);
}

.ov-row.is-open {
  box-shadow: inset 0 0 0 1px var(--ek-color-border-subtle);
}

.ov-row.is-info.is-open {
  background: var(--ek-color-surface-muted);
}

.ov-row__line {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: 100%;
  min-height: 40px;
  padding: 0 var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: var(--ek-color-content-default);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ov-row__line:hover {
  background: color-mix(in srgb, var(--ek-color-content-strong) 4%, transparent);
}

.ov-row__sev {
  flex: none;
  color: var(--ov-accent);
  font-size: var(--ek-icon-md);
}

.ov-row__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ov-row.is-info .ov-row__title {
  font-weight: var(--ek-font-weight-medium);
}

.ov-row__count {
  flex: none;
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  box-shadow: inset 0 0 0 1px var(--ek-color-border-subtle);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-caption-size);
  line-height: 20px;
  font-weight: var(--ek-font-weight-semibold);
}

.ov-row__since {
  flex: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  white-space: nowrap;
}

.ov-row__chev {
  flex: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
  transition: transform 0.15s ease;
}

.ov-row.is-open .ov-row__chev {
  transform: rotate(180deg);
}

/* ---------- madde ayrıntısı ---------- */
.ov-detail {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  margin: 0 var(--ek-space-2) var(--ek-space-2) calc(var(--ek-icon-md) + var(--ek-space-4));
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
}

.ov-detail__grid {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: var(--ek-space-3) var(--ek-space-4);
  align-items: baseline;
  margin: 0;
}

.ov-detail__grid dt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: 20px;
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ov-detail__grid dd {
  min-width: 0;
  margin: 0;
}

.ov-detail__text {
  max-width: 68ch;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: 1.55;
}

.ov-detail__facts,
.ov-detail__caps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.ov-detail__fact {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
}

.ov-detail__fact .v-icon {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-xs);
}

.ov-detail__fact b {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ov-detail__tenants {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1) var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ov-detail__tenant {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 240px;
  height: 26px;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  text-decoration: none;
  transition: var(--ek-transition-colors);
}

.ov-detail__tenant:hover {
  border-color: var(--ek-color-border-strong);
  background: var(--ek-color-surface-muted);
}

.ov-detail__tenant:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ov-detail__tenant-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ov-detail__more {
  align-self: center;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ov-detail__cap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}

.ov-detail__cap .v-icon {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

.ov-detail__cap-note {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ov-detail__cap-note::before {
  content: '· ';
}

/* "Ne yapmalı": okumanın vardığı yer — düz mavi ton, ampul ikonu. */
.ov-detail__advice {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-3);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  line-height: 1.5;
}

.ov-detail__advice > .v-icon {
  flex: none;
  margin-top: 1px;
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-icon-md);
}

.ov-detail__advice-k {
  display: block;
  margin-bottom: 2px;
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-font-weight-bold);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ov-detail__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-4);
  padding-top: var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ov-detail__secondary {
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  text-decoration: none;
}

.ov-detail__secondary:hover {
  text-decoration: underline;
}

.ov-detail__secondary:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ov-scope__expand {
  align-self: flex-start;
  margin-left: var(--ek-space-2);
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

.ov-scope__expand-hint {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular);
}

.ov-scope__calm {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-2);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}

.ov-scope__calm > .v-icon {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
}

.ov-scope__calm.is-ok > .v-icon {
  color: var(--ek-color-success);
}

.ov-scope__calm strong {
  color: var(--ek-color-content-strong);
}

.ov-scope__checks {
  display: block;
  margin-top: 2px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ov-scope__degraded {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-warning-border);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
  font-size: var(--ek-type-caption-size);
}

.ov-scope__degraded > span {
  flex: 1;
  color: var(--ek-color-content-default);
}

.ov-scope__truncated {
  margin: 0 var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

@media (max-width: 600px) {
  .ov-row__since,
  .ov-scope__preview {
    display: none;
  }

  .ov-scope__body {
    padding-left: var(--sc-pad);
  }

  .ov-detail {
    margin-left: 0;
    padding: var(--ek-space-3);
  }

  .ov-detail__grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }

  .ov-detail__grid dd + dt {
    margin-top: var(--ek-space-2);
  }
}

/* ================= BO-LOCAL-01 — dikkat dalı: uygulamanın tasarım diliyle =================
   Dal ikonu çerçeveli köşeli kutu; cevap rozetleri ve sayaçlar köşeli (hap yok), tonlar yalnız `*-subtle / -border /
   -emphasis` tokenlarıyla (uydurma karışım yok). Satır önemine göre tonun düz açık zemini + ince ton çerçevesi; açık
   satırda iç gölge yerine aynı çerçeve. Ayrıntı kutusu kutu köşeli; "Ne yapmalı" eylem tonunda ince çerçeveli kutu. */
.ov-scope {
  --sc-warn-ink: var(--ek-color-warning-emphasis);
  --sc-line: var(--ek-color-success-border);
  --sc-bg: var(--ek-color-success-subtle);
}

.ov-scope.is-warning {
  --sc-line: var(--ek-color-warning-border);
  --sc-bg: var(--ek-color-warning-subtle);
}

.ov-scope.is-critical {
  --sc-line: var(--ek-color-error-border);
  --sc-bg: var(--ek-color-error-subtle);
}

.ov-scope.is-unknown {
  --sc-line: var(--ek-color-border-default);
  --sc-bg: var(--ek-color-surface-muted);
}

.ov-scope__icon {
  border: 1px solid var(--sc-line);
  background: var(--sc-bg);
}

.ov-scope__chev {
  transition: transform var(--ek-motion-reveal);
}

.ov-scope__answer {
  border-color: var(--ek-color-success-border);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
}

.ov-scope__answer.is-critical {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.ov-scope__answer.is-warning {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.ov-scope__answer.is-unknown {
  border-color: var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
}

.ov-scope__answer i {
  border-radius: 2px;
}

.ov-row {
  border: 1px solid transparent;
  border-radius: var(--ek-radius-tile);
}

.ov-row.is-critical {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
}

.ov-row.is-warning {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
}

.ov-row.is-info {
  border-color: var(--ek-color-border-subtle);
}

.ov-row.is-open {
  box-shadow: none;
}

.ov-row__line {
  border-radius: var(--ek-radius-tile);
}

.ov-row__line:hover {
  background: transparent;
}

.ov-row__line:hover .ov-row__title {
  color: var(--ek-color-action-emphasis);
}

.ov-row__line:hover .ov-row__chev {
  color: var(--ek-color-action);
}

.ov-row__count {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  box-shadow: none;
}

.ov-row__chev {
  transition: transform var(--ek-motion-reveal);
}

.ov-detail {
  border-color: var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
}

.ov-detail__fact {
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
}

.ov-detail__tenant {
  border-radius: var(--ek-radius-md);
}

.ov-detail__tenant:hover {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}

.ov-detail__advice {
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-tile);
}

.ov-detail__advice-k {
  font-weight: var(--ek-type-micro-weight);
}

.ov-detail__secondary:hover {
  text-decoration: none;
  color: var(--ek-color-content-strong);
}

.ov-scope__degraded {
  border-radius: var(--ek-radius-tile);
}
</style>
