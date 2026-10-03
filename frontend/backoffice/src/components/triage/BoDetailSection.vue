<!--
  BoDetailSection — AYRINTI (BO_UI_PATTERNS §11.4). Tablolar, loglar, geçmiş: kararı verdikten SONRA bakılan katman.
  Katlanabilir başlık (h2 + tek cümle özet); kapalıyken içerik çizilmez, ilk açılışta `@open` yayar (sayfa veriyi o an
  çeker — ilk ekranda yük yok). Açık/kapalı durumu `?ayrinti=<id>` ile paylaşılabilir (isteğe bağlı `sync-query`).

    <BoDetailSection id="teknik" title="Teknik ayrıntılar" summary="Bağımlılıklar, podlar, kuyruk sayaçları, veri alımı"
      sync-query @open="loadHealth">…</BoDetailSection>
-->
<template>
  <section :id="id" class="bo-ds" :class="{ 'is-open': open }" :aria-labelledby="`${id}-h`">
    <component :is="`h${headingLevel}`" :id="`${id}-h`" class="bo-ds__heading">
      <button type="button" class="bo-ds__toggle" :aria-expanded="open" :aria-controls="`${id}-body`" data-testid="detail-toggle" @click="toggle">
        <v-icon class="bo-ds__chev" icon="mdi-chevron-right" aria-hidden="true" />
        <span class="bo-ds__title">{{ title }}</span>
        <span v-if="summary" class="bo-ds__summary">{{ summary }}</span>
      </button>
    </component>
    <div v-show="open" :id="`${id}-body`" class="bo-ds__body">
      <slot v-if="opened" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = withDefaults(
  defineProps<{
    id: string
    title: string
    summary?: string
    defaultOpen?: boolean
    /** Açık durumu URL'de `?ayrinti=<id>` olarak tut (paylaşılan bağlantı aynı görünümü açar). */
    syncQuery?: boolean
    headingLevel?: 2 | 3
  }>(),
  { defaultOpen: false, syncQuery: false, headingLevel: 2 },
)
const emit = defineEmits<{ open: []; toggle: [open: boolean] }>()

const route = useRoute()
const router = useRouter()
const open = ref(props.defaultOpen)
/** İçerik ilk açılışta bir kez çizilir; sonra kapatıp açmak durumu korur. */
const opened = ref(props.defaultOpen)

function listed(): string[] {
  const q = route.query.ayrinti
  return (Array.isArray(q) ? q.join(',') : (q ?? '')).split(',').filter(Boolean)
}

function setOpen(value: boolean) {
  open.value = value
  if (value && !opened.value) {
    opened.value = true
    emit('open')
  }
  emit('toggle', value)
}

function toggle() {
  setOpen(!open.value)
  if (!props.syncQuery) return
  const set = new Set(listed())
  if (open.value) set.add(props.id)
  else set.delete(props.id)
  const { ayrinti: _drop, ...rest } = route.query
  void router.replace({ query: set.size ? { ...rest, ayrinti: [...set].join(',') } : rest })
}

onMounted(() => {
  if (props.defaultOpen) emit('open')
  else if (props.syncQuery && listed().includes(props.id)) setOpen(true)
})
</script>

<style scoped>
.bo-ds {
  border-top: 1px solid var(--ek-color-border-default);
}

.bo-ds__heading {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
}

.bo-ds__toggle {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ek-space-1) var(--ek-space-3);
  width: 100%;
  padding: var(--ek-space-3) 0;
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: var(--ek-color-content-strong);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.bo-ds__toggle:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-ds__chev {
  align-self: center;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
  transition: transform var(--ek-duration-fast) var(--ek-easing-standard);
}

.bo-ds.is-open .bo-ds__chev {
  transform: rotate(90deg);
}

.bo-ds__title {
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-ds__summary {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}

.bo-ds__body {
  padding-bottom: var(--ek-space-4);
}

@media (prefers-reduced-motion: reduce) {
  .bo-ds__chev {
    transition: none;
  }
}

/* BO-LOCAL-01 — katlanır ayrıntı: ok çerçeveli köşeli kutuda; başlık üzerine gelince eylem tonu; geçiş tek hız rolüyle. */
.bo-ds__toggle {
  align-items: center;
}

.bo-ds__chev {
  width: 24px;
  height: 24px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
  font-size: var(--ek-icon-sm);
  transition: transform var(--ek-motion-reveal);
}

.bo-ds__toggle:hover .bo-ds__chev {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.bo-ds__toggle:hover .bo-ds__title {
  color: var(--ek-color-action-emphasis);
}
</style>
