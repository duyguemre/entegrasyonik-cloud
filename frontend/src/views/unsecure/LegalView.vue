<!--
  frontend/src/views/unsecure/LegalView.vue

  Uygulama içi yasal belgeler (`/legal/:slug`, kimliksiz). İçerik KOPYALANMAZ: yasal metinlerin tek kanonik kaynağı
  sitedir (ADR-0014 Karar 5) — `site/src/data/legal/*` aynen kullanılır; satır içi işaretleme (**kalın**,
  [etiket](/yasal/..), {{YER_TUTUCU}}) `v-html` OLMADAN Vue düğümlerine çevrilir (`components/legal/LegalInline.ts`). Böylece
  metin, yer tutucu ve yasaklı ifade denetimleri (site tests/legal.test.ts) buradaki görünüm için de geçerlidir.
  Eski elle yazılmış `public/legal/*.html` kopyaları (kanıtsız iddialar içeriyordu) kaldırıldı; eski adresler
  router'da buraya yönlenir.

  Görünüm giriş ekranıyla aynı dil: düz yüzeyler, ince ayraçlar, editoryal başlık, birincil renkte ince vurgular.
  Hukuki inceleme bitmeden (LEGAL_REVIEWED=false) sitedeki gibi TASLAK bandı gösterilir; `note` blokları (iç karar
  notları) uygulamada gösterilmez.
-->
<template>
  <div ref="scroller" class="ek-legal" @scroll.passive="onScroll">
    <div class="ek-legal__progress" :style="{ transform: `scaleX(${progress})` }" aria-hidden="true"></div>

    <header class="ek-legal__bar">
      <div class="ek-legal__bar-inner">
        <router-link to="/login" class="ek-legal__brand" aria-label="Entegrasyonik — girişe dön">
          <EkBrandLogo :size="24" />
        </router-link>
        <span class="ek-legal__bar-sep" aria-hidden="true"></span>
        <span class="ek-legal__bar-label">Yasal</span>
        <router-link to="/login" class="ek-legal__back">
          <v-icon size="16" aria-hidden="true">mdi-arrow-left</v-icon>Girişe dön
        </router-link>
      </div>
    </header>

    <main v-if="doc" class="ek-legal__main">
      <section class="ek-legal__hero">
        <p class="ek-legal__eyebrow">Yasal belgeler</p>
        <h1 class="ek-legal__title">{{ doc.title }}</h1>
        <p class="ek-legal__summary">{{ doc.summary }}</p>
        <dl class="ek-legal__meta">
          <div>
            <dt>Son güncelleme</dt>
            <dd><time :datetime="doc.updatedAt">{{ formatDate(doc.updatedAt) }}</time></dd>
          </div>
          <div>
            <dt>Sürüm</dt>
            <dd>{{ doc.version }}</dd>
          </div>
          <div>
            <dt>Okuma süresi</dt>
            <dd>~{{ readingMinutes }} dk</dd>
          </div>
        </dl>
        <p v-if="!LEGAL_REVIEWED" class="ek-legal__draft" role="note">
          <v-icon size="16" aria-hidden="true">mdi-file-document-edit-outline</v-icon>{{ LEGAL_DRAFT_BANNER }}
        </p>
      </section>

      <div class="ek-legal__grid">
        <aside class="ek-legal__aside">
          <nav class="ek-legal__toc" aria-label="Bu belgede">
            <p class="ek-legal__aside-title">Bu belgede</p>
            <ol>
              <li v-for="s in sections" :key="s.id">
                <a :href="`#${s.id}`" :class="{ 'is-active': s.id === activeId }" :aria-current="s.id === activeId ? 'true' : undefined"
                  @click.prevent="goTo(s.id)">
                  <span class="ek-legal__toc-num">{{ s.num }}</span>{{ s.label }}
                </a>
              </li>
            </ol>
          </nav>
          <nav class="ek-legal__docs" aria-label="Diğer yasal belgeler">
            <p class="ek-legal__aside-title">Diğer belgeler</p>
            <ul>
              <li v-for="d in otherDocs" :key="d.slug">
                <router-link :to="`/legal/${d.slug}`">{{ d.title }}</router-link>
              </li>
            </ul>
          </nav>
        </aside>

        <article class="ek-legal__article">
          <section v-for="s in sections" :id="s.id" :key="s.id" class="ek-legal__section">
            <h2 class="ek-legal__h2">
              <span class="ek-legal__h2-num" aria-hidden="true">{{ s.num }}</span>{{ s.label }}
            </h2>
            <template v-for="(b, i) in s.blocks" :key="i">
              <p v-if="b.type === 'p'" class="ek-legal__p"><LegalInline :text="b.text" /></p>
              <h3 v-else-if="b.type === 'h3'" class="ek-legal__h3"><LegalInline :text="b.text" /></h3>
              <ul v-else-if="b.type === 'ul'" class="ek-legal__list">
                <li v-for="(it, k) in b.items" :key="k"><LegalInline :text="it" /></li>
              </ul>
              <ol v-else-if="b.type === 'ol'" class="ek-legal__list ek-legal__list--ol">
                <li v-for="(it, k) in b.items" :key="k"><LegalInline :text="it" /></li>
              </ol>
              <div v-else-if="b.type === 'table'" class="ek-legal__table-wrap">
                <table class="ek-legal__table">
                  <caption>{{ b.caption }}</caption>
                  <thead>
                    <tr><th v-for="h in b.head" :key="h" scope="col">{{ h }}</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, k) in b.rows" :key="k">
                      <td v-for="(c, j) in r" :key="j"><LegalInline :text="c" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </section>

          <footer class="ek-legal__end">
            <p>Sorularınız için <router-link to="/legal/kunye">Künye</router-link> sayfasındaki iletişim bilgilerini kullanabilirsiniz.</p>
            <p class="ek-legal__copy">© {{ year }} Entegrasyonik</p>
          </footer>
        </article>
      </div>
    </main>

    <main v-else class="ek-legal__main ek-legal__missing">
      <h1 class="ek-legal__title">Belge bulunamadı</h1>
      <p class="ek-legal__summary">Aradığınız yasal belge taşınmış ya da kaldırılmış olabilir.</p>
      <ul class="ek-legal__missing-list">
        <li v-for="d in legalDocs" :key="d.slug"><router-link :to="`/legal/${d.slug}`">{{ d.title }}</router-link></li>
      </ul>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { EkBrandLogo } from '@entegrasyonik/ui/components'
import { legalDocs, LEGAL_REVIEWED, LEGAL_DRAFT_BANNER } from '@site/data/legal'
import { collectTexts } from '@site/lib/legal-render'
import LegalInline from '@/components/legal/LegalInline'

const route = useRoute()
const doc = computed(() => legalDocs.find((d) => d.slug === route.params.slug))
const otherDocs = computed(() => legalDocs.filter((d) => d.slug !== doc.value?.slug))
const year = new Date().getFullYear()

/** "3. Başlık" → numara rozeti + başlık (numarasız başlık olduğu gibi). */
const sections = computed(() =>
  (doc.value?.sections ?? []).map((s) => {
    const m = /^(\d+)\.\s+(.*)$/.exec(s.title)
    return {
      id: s.id,
      num: m ? m[1].padStart(2, '0') : '',
      label: m ? m[2] : s.title,
      blocks: s.blocks.filter((b) => b.type !== 'note'),
    }
  }),
)

const readingMinutes = computed(() => {
  if (!doc.value) return 0
  const words = collectTexts(doc.value).join(' ').split(/\s+/).length
  return Math.max(1, Math.round(words / 200))
})

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/* ---- Okuma ilerlemesi + etkin bölüm ---- */
const scroller = ref<HTMLElement | null>(null)
const progress = ref(0)
const activeId = ref('')
let observer: IntersectionObserver | undefined

function onScroll() {
  const el = scroller.value
  if (!el) return
  const max = el.scrollHeight - el.clientHeight
  progress.value = max > 0 ? Math.min(1, el.scrollTop / max) : 0
}

function observe() {
  observer?.disconnect()
  if (!scroller.value || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) activeId.value = visible[0].target.id
    },
    { root: scroller.value, rootMargin: '-80px 0px -65% 0px' },
  )
  scroller.value.querySelectorAll('.ek-legal__section').forEach((s) => observer!.observe(s))
}

function goTo(id: string) {
  const target = scroller.value?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
  if (!target || !scroller.value) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  scroller.value.scrollTo({ top: target.offsetTop - 88, behavior: reduce ? 'auto' : 'smooth' })
  activeId.value = id
  history.replaceState(history.state, '', `#${id}`)
}

watch(
  () => route.params.slug,
  async () => {
    activeId.value = sections.value[0]?.id ?? ''
    document.title = doc.value ? `${doc.value.title} · Entegrasyonik` : 'Yasal · Entegrasyonik'
    await nextTick()
    scroller.value?.scrollTo({ top: 0 })
    onScroll()
    observe()
  },
)

onMounted(async () => {
  activeId.value = sections.value[0]?.id ?? ''
  if (doc.value) document.title = `${doc.value.title} · Entegrasyonik`
  await nextTick()
  observe()
  const hash = route.hash.replace('#', '')
  if (hash) goTo(hash)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
/* Kendi kaydırma kabı (UnsecureLayout gövdeyi kilitleyebilir): ilerleme çizgisi ve gözlemci bu kaba bağlı. */
.ek-legal {
  position: fixed;
  inset: 0;
  overflow-y: auto;
  background: var(--ek-color-background);
  color: var(--ek-color-content-default);
}

.ek-legal__progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 3;
  height: 2px;
  background: var(--ek-color-primary);
  transform-origin: left center;
  transform: scaleX(0);
}

/* ---- Üst çubuk ---- */
.ek-legal__bar {
  position: sticky;
  top: 0;
  z-index: 2;
  border-bottom: 1px solid var(--ek-color-border-default);
  background: color-mix(in srgb, var(--ek-color-background) 88%, transparent);
  backdrop-filter: blur(10px);
}

.ek-legal__bar-inner {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  max-width: 1160px;
  height: 64px;
  margin: 0 auto;
  padding: 0 var(--ek-space-6);
}

.ek-legal__brand {
  display: inline-flex;
  text-decoration: none;
}

.ek-legal__bar-sep {
  width: 1px;
  height: 18px;
  background: var(--ek-color-border-default);
}

.ek-legal__bar-label {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
}

.ek-legal__back {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin-left: auto;
  min-height: 32px;
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: 999px;
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-default);
  text-decoration: none;
  transition: border-color var(--ek-motion-feedback), color var(--ek-motion-feedback);
}

.ek-legal__back:hover,
.ek-legal__back:focus-visible {
  border-color: var(--ek-color-content-subtle);
  color: var(--ek-color-content-strong);
}

/* ---- Başlık alanı ---- */
.ek-legal__main {
  max-width: 1160px;
  margin: 0 auto;
  padding: var(--ek-space-12) var(--ek-space-6) var(--ek-space-16);
}

.ek-legal__hero {
  max-width: 760px;
  padding-bottom: var(--ek-space-10);
  margin-bottom: var(--ek-space-10);
  border-bottom: 1px solid var(--ek-color-border-default);
}

.ek-legal__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-3);
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ek-color-primary);
}

.ek-legal__eyebrow::before {
  content: '';
  width: 18px;
  height: 1.5px;
  border-radius: 1px;
  background: currentColor;
}

.ek-legal__title {
  margin: 0 0 var(--ek-space-4);
  font-size: clamp(2rem, 3.4vw, 2.75rem);
  font-weight: var(--ek-font-weight-semibold);
  line-height: 1.1;
  letter-spacing: -0.03em;
  color: var(--ek-color-content-strong);
}

.ek-legal__summary {
  margin: 0;
  max-width: 62ch;
  font-size: 1.0625rem;
  line-height: 1.65;
  color: var(--ek-color-content-default);
}

.ek-legal__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-3) var(--ek-space-10);
  margin: var(--ek-space-8) 0 0;
}

.ek-legal__meta dt {
  margin-bottom: 2px;
  font-size: var(--ek-font-size-2xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.ek-legal__meta dd {
  margin: 0;
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
  font-variant-numeric: tabular-nums;
}

.ek-legal__draft {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: var(--ek-space-6) 0 0;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid color-mix(in srgb, var(--ek-color-warning) 45%, transparent);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-warning-subtle, color-mix(in srgb, var(--ek-color-warning) 10%, transparent));
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-warning-emphasis);
}

/* ---- İki sütun: yapışkan içindekiler + metin ---- */
.ek-legal__grid {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  gap: var(--ek-space-16);
}

.ek-legal__aside {
  position: sticky;
  top: 96px;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-8);
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}

.ek-legal__aside-title {
  margin: 0 0 var(--ek-space-3);
  font-size: var(--ek-font-size-2xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.ek-legal__toc ol,
.ek-legal__docs ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-legal__toc ol {
  border-left: 1px solid var(--ek-color-border-default);
}

.ek-legal__toc a {
  position: relative;
  display: flex;
  gap: var(--ek-space-2);
  padding: 6px 0 6px var(--ek-space-4);
  font-size: var(--ek-font-size-sm);
  line-height: 1.4;
  color: var(--ek-color-content-default);
  text-decoration: none;
  transition: color var(--ek-motion-feedback);
}

.ek-legal__toc a::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 6px;
  bottom: 6px;
  width: 2px;
  border-radius: 2px;
  background: transparent;
  transition: background-color var(--ek-motion-feedback);
}

.ek-legal__toc a:hover {
  color: var(--ek-color-content-strong);
}

.ek-legal__toc a.is-active {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
}

.ek-legal__toc a.is-active::before {
  background: var(--ek-color-primary);
}

.ek-legal__toc-num {
  flex: none;
  min-width: 18px;
  font-size: var(--ek-font-size-xs);
  font-variant-numeric: tabular-nums;
  color: var(--ek-color-content-muted);
  line-height: 1.7;
}

.ek-legal__docs a {
  display: block;
  padding: 5px 0;
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
  text-decoration: none;
}

.ek-legal__docs a:hover {
  color: var(--ek-color-primary);
}

/* ---- Metin ---- */
.ek-legal__article {
  max-width: 720px;
}

.ek-legal__section {
  padding-bottom: var(--ek-space-10);
  scroll-margin-top: 88px;
}

.ek-legal__section + .ek-legal__section {
  padding-top: var(--ek-space-10);
  border-top: 1px solid var(--ek-color-border-default);
}

.ek-legal__h2 {
  display: flex;
  align-items: baseline;
  gap: var(--ek-space-3);
  margin: 0 0 var(--ek-space-5, 20px);
  font-size: 1.375rem;
  font-weight: var(--ek-font-weight-semibold);
  line-height: 1.3;
  letter-spacing: -0.015em;
  color: var(--ek-color-content-strong);
}

.ek-legal__h2-num {
  flex: none;
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--ek-color-primary);
}

.ek-legal__h3 {
  margin: var(--ek-space-6) 0 var(--ek-space-2);
  font-size: 1rem;
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-legal__p,
.ek-legal__list li {
  font-size: 1rem;
  line-height: 1.75;
  color: var(--ek-color-content-default);
}

.ek-legal__p {
  margin: 0 0 var(--ek-space-4);
}

.ek-legal__list {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-5, 20px);
  padding: 0;
  list-style: none;
}

.ek-legal__list li {
  position: relative;
  padding-left: var(--ek-space-6);
}

.ek-legal__list li::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 0.78em;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--ek-color-primary) 70%, transparent);
}

.ek-legal__list--ol {
  counter-reset: ek-legal;
}

.ek-legal__list--ol li {
  counter-increment: ek-legal;
}

.ek-legal__list--ol li::before {
  content: counter(ek-legal) '.';
  top: 0;
  left: 0;
  width: auto;
  height: auto;
  border-radius: 0;
  background: none;
  font-weight: var(--ek-font-weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--ek-color-primary);
}

.ek-legal__article :deep(strong) {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-legal__article :deep(a),
.ek-legal__end a {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--ek-color-content-strong) 30%, transparent);
  text-underline-offset: 3px;
  transition: color var(--ek-motion-feedback), text-decoration-color var(--ek-motion-feedback);
}

.ek-legal__article :deep(a:hover),
.ek-legal__end a:hover {
  color: var(--ek-color-primary);
  text-decoration-color: currentColor;
}

/* Değeri henüz verilmemiş yer tutucu (taslak): sitedeki gibi görünür kalır. */
.ek-legal__article :deep(mark.ph) {
  padding: 0 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ek-color-warning) 18%, transparent);
  color: var(--ek-color-content-strong);
  font-size: 0.9em;
}

.ek-legal__table-wrap {
  margin: 0 0 var(--ek-space-6);
  overflow-x: auto;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}

.ek-legal__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ek-font-size-sm);
}

.ek-legal__table caption {
  padding: var(--ek-space-3) var(--ek-space-4);
  text-align: left;
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  border-bottom: 1px solid var(--ek-color-border-default);
}

.ek-legal__table th {
  padding: var(--ek-space-2) var(--ek-space-4);
  text-align: left;
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-muted);
  background: var(--ek-color-surface-muted);
  border-bottom: 1px solid var(--ek-color-border-default);
}

.ek-legal__table td {
  padding: var(--ek-space-3) var(--ek-space-4);
  vertical-align: top;
  line-height: 1.6;
  color: var(--ek-color-content-default);
}

.ek-legal__table tr + tr td {
  border-top: 1px solid var(--ek-color-border-default);
}

.ek-legal__end {
  padding-top: var(--ek-space-8);
  border-top: 1px solid var(--ek-color-border-default);
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
}

.ek-legal__end p {
  margin: 0 0 var(--ek-space-2);
}

.ek-legal__copy {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-font-size-xs);
}

.ek-legal__missing-list {
  margin: var(--ek-space-8) 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

@media (max-width: 960px) {
  .ek-legal__grid {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-8);
  }

  .ek-legal__aside {
    position: static;
    max-height: none;
  }

  .ek-legal__docs {
    display: none;
  }

  .ek-legal__main {
    padding: var(--ek-space-8) var(--ek-space-4) var(--ek-space-12);
  }

  .ek-legal__bar-inner {
    padding: 0 var(--ek-space-4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ek-legal__toc a,
  .ek-legal__toc a::before {
    transition: none;
  }
}
</style>
