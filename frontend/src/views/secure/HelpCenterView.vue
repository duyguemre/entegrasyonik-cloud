<!--
  frontend/src/views/secure/HelpCenterView.vue

  Yardım merkezi (faz3-fe-help). Dört görünüm, tek sayfa:
    ana sayfa  → arama + "Başlarken" yolu + kategori ızgarası + destek çağrısı
    kategori   → kategorinin makaleleri
    arama      → başlık + içerikte arama (Türkçe duyarlı; eşleşme vurgusu, gövdeden alıntı)
    makale     → sol konu ağacı + makale (adımlar, "Buraya git", faydalı mıydı, ilgili makaleler)
  Adres TEK KAYNAKTIR: `/help?article=<id>` / `/help?category=<id>` (tarayıcı geri/ileri çalışır; `screens.ts` urlParams).
  İçerik `help/` kaydından; backend çağrısı YOK (yalnız "Destek talebi aç" mevcut `TicketService/openTicket` diyaloğu).
-->
<template>
  <div class="ek-help-center helpCenterView" :class="`is-${mode}`">
    <EkPageHeader :section="sectionLabel" :title="ui.title" />

    <div class="ek-help-center__search" :class="{ 'is-hero': mode === 'home' }" role="search">
      <div v-if="mode === 'home'" class="ek-help-center__hero-text">
        <h2 class="ek-help-center__hero-title">Size nasıl yardımcı olabiliriz?</h2>
        <p class="ek-help-center__hero-sub">Makalelerde arayın ya da aşağıdan bir konu seçin.</p>
      </div>
      <v-text-field
        ref="searchField"
        v-model="query"
        class="ek-help-center__field"
        label="Yardımda ara"
        placeholder="ör. sipariş gelmedi, güvenlik stoğu, Trendyol API"
        prepend-inner-icon="mdi-magnify"
        density="compact"
        hide-details
        clearable
        autocomplete="off"
        :aria-describedby="resultsStatusId"
        @keydown.down.prevent="focusResult(0)"
        @keydown.enter.prevent="openFirstResult"
        @keydown.esc="query = ''"
      />
      <div v-if="mode === 'home'" class="ek-help-center__popular">
        <span class="ek-help-center__popular-label">Sık aranan:</span>
        <button v-for="a in popular" :key="a.id" type="button" class="ek-help-center__chip" @click="goArticle(a.id)">{{ a.title }}</button>
      </div>
    </div>
    <p :id="resultsStatusId" class="ek-sr-only" role="status" aria-live="polite">{{ searchStatus }}</p>

    <!-- ARAMA -->
    <section v-if="mode === 'search'" class="ek-help-center__results" aria-label="Arama sonuçları">
      <p class="ek-help-center__count">
        <template v-if="trimmed.length < 2">Aramak için en az 2 karakter yazın.</template>
        <template v-else-if="results.length"><strong class="ek-num">{{ results.length }}</strong> makale bulundu</template>
      </p>
      <ul v-if="results.length" ref="resultList" class="ek-help-center__result-list">
        <li v-for="(r, i) in results" :key="r.article.id">
          <button type="button" class="ek-help-center__result" :data-result-index="i" data-help-result @click="goArticle(r.article.id)" @keydown.down.prevent="focusResult(i + 1)" @keydown.up.prevent="i === 0 ? focusSearch() : focusResult(i - 1)">
            <span class="ek-help-center__result-cat"><v-icon :icon="categoryIcon(r.article.category)" aria-hidden="true" />{{ categoryTitle(r.article.category) }}</span>
            <span class="ek-help-center__result-title"><HelpMarks :parts="r.title" /></span>
            <span class="ek-help-center__result-summary"><HelpMarks :parts="r.summary" /></span>
            <span v-if="r.excerpt.length" class="ek-help-center__result-excerpt"><HelpMarks :parts="r.excerpt" /></span>
          </button>
        </li>
      </ul>
      <!-- A6b Standart 1: boş durum tek bileşen (EkEmptyState). -->
      <EkEmptyState
        v-else-if="trimmed.length >= 2"
        variant="no-results"
        class="ek-help-center__empty"
        :title="`“${trimmed}” için makale bulunamadı`"
        message="Farklı bir sözcük deneyin ya da aramayı temizleyip konulara göz atın. Aradığınızı bulamazsanız destek ekibine yazın."
        show-action
        action-text="Destek talebi aç"
        action-icon="mdi-lifebuoy"
        @action="ticketOpen = true"
      />
    </section>

    <!-- ANA SAYFA -->
    <div v-else-if="mode === 'home'" class="ek-help-center__home">
      <section class="ek-help-center__start" aria-labelledby="help-start-title">
        <div class="ek-help-center__section-head">
          <h2 id="help-start-title" class="ek-help-center__h2">Başlarken</h2>
          <p class="ek-help-center__muted">Üç adımda kullanıma hazır olun.</p>
        </div>
        <ol class="ek-help-center__start-list">
          <li v-for="(a, i) in startArticles" :key="a.id">
            <button type="button" class="ek-help-center__start-card" @click="goArticle(a.id)">
              <span class="ek-help-center__start-no ek-num" aria-hidden="true">{{ i + 1 }}</span>
              <span class="ek-help-center__start-title">{{ a.title }}</span>
              <span class="ek-help-center__muted">{{ a.summary }}</span>
              <span class="ek-help-center__start-go" aria-hidden="true">Oku <v-icon icon="mdi-arrow-right" /></span>
            </button>
          </li>
        </ol>
      </section>

      <section aria-labelledby="help-topics-title">
        <div class="ek-help-center__section-head">
          <h2 id="help-topics-title" class="ek-help-center__h2">Konular</h2>
        </div>
        <ul class="ek-help-center__grid">
          <li v-for="c in topicCards" :key="c.id" class="ek-help-center__cat" :data-category="c.id">
            <button type="button" class="ek-help-center__cat-head" @click="goCategory(c.id)">
              <EkIconTile :icon="c.icon" tone="action" size="md" />
              <span class="ek-help-center__cat-text">
                <span class="ek-help-center__cat-title">{{ c.title }}</span>
                <span class="ek-help-center__muted">{{ c.description }}</span>
              </span>
              <span class="ek-help-center__cat-count ek-num">{{ c.articles.length }} makale</span>
            </button>
            <!-- FR2-HELP madde 17: makale bağlantıları sessiz liste satırı (belge glifi + başlık + hover'da ok), mavi
                 alt çizgili bağlantı değil; 3'ten fazla makalede kart altında "Tümünü gör". -->
            <ul class="ek-help-center__cat-links">
              <li v-for="a in c.articles.slice(0, 3)" :key="a.id">
                <button type="button" class="ek-help-center__cat-link" @click="goArticle(a.id)">
                  <v-icon class="ek-help-center__cat-link-doc" icon="mdi-file-document-outline" aria-hidden="true" />
                  <span class="ek-help-center__cat-link-text">{{ a.title }}</span>
                  <v-icon class="ek-help-center__cat-link-go" icon="mdi-chevron-right" aria-hidden="true" />
                </button>
              </li>
            </ul>
            <button v-if="c.articles.length > 3" type="button" class="ek-link ek-link--sm ek-help-center__cat-all" @click="goCategory(c.id)">
              Tümünü gör ({{ c.articles.length }})
              <v-icon class="ek-link__arrow" icon="mdi-arrow-right" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>

      <div class="ek-help-center__bottom">
        <section v-if="faqItems.length" class="ek-help-center__faq" aria-labelledby="help-faq-title">
          <div class="ek-help-center__section-head">
            <h2 id="help-faq-title" class="ek-help-center__h2">Sık sorulan sorular</h2>
            <button type="button" class="ek-link ek-link--sm" @click="goArticle('faq-general')">
              Tümünü gör
              <v-icon class="ek-link__arrow" icon="mdi-arrow-right" aria-hidden="true" />
            </button>
          </div>
          <HelpArticleBody :blocks="[{ type: 'faq', items: faqItems }]" />
        </section>
        <HelpSupportCta stacked @ticket="ticketOpen = true" />
      </div>
    </div>

    <!-- KATEGORİ / MAKALE: sol konu ağacı + içerik -->
    <div v-else class="ek-help-center__layout">
      <nav class="ek-help-center__nav" aria-label="Yardım konuları">
        <button type="button" class="ek-help-center__nav-home" @click="goHome">
          <v-icon icon="mdi-arrow-left" aria-hidden="true" />Tüm konular
        </button>
        <ul class="ek-help-center__nav-list">
          <li v-for="c in categoryCards" :key="c.id">
            <button
              type="button"
              class="ek-help-center__nav-cat"
              :class="{ 'is-current': c.id === currentCategoryId }"
              :aria-current="mode === 'category' && c.id === currentCategoryId ? 'page' : undefined"
              @click="goCategory(c.id)"
            >
              <v-icon :icon="c.icon" aria-hidden="true" />
              <span>{{ c.title }}</span>
            </button>
            <ul v-if="c.id === currentCategoryId" class="ek-help-center__nav-articles">
              <li v-for="a in c.articles" :key="a.id">
                <button type="button" class="ek-help-center__nav-article" :class="{ 'is-current': a.id === article?.id }" :aria-current="a.id === article?.id ? 'page' : undefined" @click="goArticle(a.id)">{{ a.title }}</button>
              </li>
            </ul>
          </li>
        </ul>
      </nav>

      <main class="ek-help-center__main">
        <!-- Kategori -->
        <section v-if="mode === 'category' && currentCategory" class="ek-help-center__category" aria-labelledby="help-category-title">
          <nav class="ek-help-center__crumbs" aria-label="Yardım yolu">
            <button type="button" class="ek-link ek-link--sm ek-help-center__crumb" @click="goHome">Yardım merkezi</button>
            <v-icon icon="mdi-chevron-right" aria-hidden="true" />
            <span aria-current="page">{{ currentCategory.title[locale] }}</span>
          </nav>
          <header class="ek-help-center__article-head">
            <EkIconTile :icon="currentCategory.icon" tone="action" size="lg" />
            <div>
              <h2 id="help-category-title" class="ek-help-center__article-title">{{ currentCategory.title[locale] }}</h2>
              <p class="ek-help-center__lead">{{ currentCategory.description[locale] }}</p>
            </div>
          </header>
          <ul class="ek-help-center__category-list">
            <li v-for="a in categoryArticles" :key="a.id">
              <button type="button" class="ek-help-center__category-item" @click="goArticle(a.id)">
                <span class="ek-help-center__result-title">{{ a.title }}</span>
                <span class="ek-help-center__muted">{{ a.summary }}</span>
                <v-icon icon="mdi-chevron-right" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </section>

        <!-- Makale -->
        <article v-else-if="article" ref="articleEl" class="ek-help-center__article" :data-article-id="article.id" aria-labelledby="help-article-title" tabindex="-1">
          <nav class="ek-help-center__crumbs" aria-label="Yardım yolu">
            <button type="button" class="ek-link ek-link--sm ek-help-center__crumb" @click="goHome">Yardım merkezi</button>
            <v-icon icon="mdi-chevron-right" aria-hidden="true" />
            <button type="button" class="ek-link ek-link--sm ek-help-center__crumb" @click="goCategory(article.category)">{{ categoryTitle(article.category) }}</button>
          </nav>
          <header class="ek-help-center__article-top">
            <h2 id="help-article-title" class="ek-help-center__article-title">{{ article.title }}</h2>
            <p class="ek-help-center__lead">{{ article.summary }}</p>
            <div v-if="article.goTo?.length" class="ek-help-center__goto" aria-label="İlgili ekranlar">
              <template v-for="g in article.goTo" :key="g.screen">
                <EkButton v-if="nav.canOpenScreen(g.screen)" tone="secondary" size="sm" icon="mdi-open-in-new" data-help-goto :data-screen="g.screen" @click="nav.openScreen(g.screen)">{{ g.label }}</EkButton>
                <span v-else class="ek-help-center__goto-off" data-help-goto-off :data-screen="g.screen">
                  <v-icon icon="mdi-lock-outline" aria-hidden="true" />{{ g.label }} — bu ekran menünüzde yok
                </span>
              </template>
            </div>
          </header>
          <p v-if="article.bodyLocale !== locale" class="ek-help-center__lang-note">This article is currently available in Turkish only.</p>

          <HelpArticleBody :blocks="article.body" />

          <section class="ek-help-center__feedback" aria-labelledby="help-feedback-title">
            <h3 id="help-feedback-title" class="ek-help-center__feedback-title">Bu makale faydalı mıydı?</h3>
            <div class="ek-help-center__feedback-actions">
              <EkButton tone="secondary" size="sm" icon="mdi-thumb-up-outline" :aria-pressed="vote === 'up'" :class="{ 'is-voted': vote === 'up' }" @click="setVote('up')">Evet</EkButton>
              <EkButton tone="secondary" size="sm" icon="mdi-thumb-down-outline" :aria-pressed="vote === 'down'" :class="{ 'is-voted': vote === 'down' }" @click="setVote('down')">Hayır</EkButton>
            </div>
            <p class="ek-help-center__feedback-msg" role="status" aria-live="polite">
              <template v-if="vote === 'up'">Teşekkürler! Geri bildiriminiz bu cihazda kaydedildi.</template>
              <template v-else-if="vote === 'down'">
                Teşekkürler. Sorununuz çözülmediyse
                <button type="button" class="ek-link ek-help-center__inline-link" @click="ticketOpen = true">destek talebi açın</button>; ekibimiz yardımcı olsun.
              </template>
            </p>
          </section>

          <section v-if="relatedArticles.length" class="ek-help-center__related" aria-labelledby="help-related-title">
            <h3 id="help-related-title" class="ek-help-center__h3">İlgili makaleler</h3>
            <ul>
              <li v-for="r in relatedArticles" :key="r.id">
                <button type="button" class="ek-help-center__related-card" @click="goArticle(r.id)">
                  <span class="ek-help-center__result-cat"><v-icon :icon="categoryIcon(r.category)" aria-hidden="true" />{{ categoryTitle(r.category) }}</span>
                  <span class="ek-help-center__result-title">{{ r.title }}</span>
                </button>
              </li>
            </ul>
          </section>

          <HelpSupportCta compact @ticket="ticketOpen = true" />
        </article>

        <!-- Bilinmeyen makale -->
        <EkEmptyState
          v-else
          variant="no-results"
          class="ek-help-center__empty"
          title="Makale bulunamadı"
          message="Bağlantı eski olabilir. Konulara göz atın ya da yukarıdan arayın."
          show-action
          action-text="Yardım merkezine dön"
          action-icon="mdi-view-grid-outline"
          @action="goHome"
        />
      </main>
    </div>

    <TicketCreateDialog v-model="ticketOpen" :submit-ticket="createTicket" @view="onTicketView" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import EkPageHeader from '@/components/page/EkPageHeader.vue'
import { EkButton, EkIconTile, EkEmptyState } from '@entegrasyonik/ui/components'
import HelpArticleBody from '@/components/help/HelpArticleBody.vue'
import HelpMarks from '@/components/help/HelpMarks.vue'
import HelpSupportCta from '@/components/help/HelpSupportCta.vue'
import TicketCreateDialog from '@/components/ticket/TicketCreateDialog.vue'
import { useTicketActions } from '@/components/ticket/composables/useTicketActions'
import {
  HELP_CATEGORIES,
  HELP_SCREEN_KEY,
  HELP_SCREEN_SLUG,
  getHelpArticle,
  getHelpArticles,
  helpCategory,
  normalizeLocale,
  searchHelpArticles,
} from '@/help'
import { setHelpLinkTitle } from '@/help/helpLink'
import { useHelpFeedback } from '@/help/feedback'
import { useHelpNavigation } from '@/help/useHelpNavigation'
import { useWorkspaceStore } from '@/stores/workspace'

const props = defineProps<{ parameters?: Record<string, any> }>()

const { t, locale: i18nLocale } = useI18n({ useScope: 'global' })
const route = useRoute()
const router = useRouter()
const workspace = useWorkspaceStore()
const nav = useHelpNavigation()
const feedback = useHelpFeedback()
const { createTicket } = useTicketActions(() => undefined)

const locale = computed(() => normalizeLocale(String(i18nLocale.value)))
const ui = computed(() => ({ title: t('help.center.title') }))
const sectionLabel = computed(() => t('shell.section.help'))
watch(() => ui.value.title, (title) => setHelpLinkTitle(title), { immediate: true })

const articles = computed(() => getHelpArticles(locale.value))

// ---- Adres ↔ durum ----
const articleId = ref<string | null>(null)
const categoryId = ref<string | null>(null)
const query = ref('')
const trimmed = computed(() => (query.value ?? '').trim())

function readFrom(source: Record<string, unknown> | undefined) {
  const a = source?.article
  const c = source?.category
  articleId.value = typeof a === 'string' && a ? a : null
  categoryId.value = !articleId.value && typeof c === 'string' && c ? c : null
}

const onHelpRoute = () => route.path === `/${HELP_SCREEN_SLUG}`
watch(
  () => [route.path, route.query.article, route.query.category],
  () => {
    if (onHelpRoute()) readFrom(route.query as Record<string, unknown>)
  },
  { immediate: true },
)

/** Sekme bağlantısının parametreleri adresle eş tutulur (sekmeye geri dönünce aynı makale açılır). */
function syncTabParams(params: Record<string, string>) {
  const tab = workspace.tabs.find((x: any) => x.link?.code === HELP_SCREEN_KEY)
  if (tab) tab.link.parameters = { ...params }
}

function go(params: Record<string, string>) {
  query.value = ''
  syncTabParams(params)
  if (router) router.push({ path: `/${HELP_SCREEN_SLUG}`, query: params }).catch(() => undefined)
  else readFrom(params)
}
const goHome = () => go({})
const goCategory = (id: string) => go({ category: id })
const goArticle = (id: string) => go({ article: id })

const mode = computed<'home' | 'search' | 'category' | 'article'>(() => {
  if (trimmed.value) return 'search'
  if (articleId.value) return 'article'
  if (categoryId.value) return 'category'
  return 'home'
})

// ---- İçerik ----
const article = computed(() => getHelpArticle(articleId.value, locale.value))
const currentCategoryId = computed(() => article.value?.category ?? categoryId.value)
const currentCategory = computed(() => (currentCategoryId.value ? helpCategory(currentCategoryId.value) : undefined))
const categoryArticles = computed(() => articles.value.filter((a) => a.category === currentCategoryId.value))

const categoryTitle = (id: string) => helpCategory(id)?.title[locale.value] ?? id
const categoryIcon = (id: string) => helpCategory(id)?.icon ?? 'mdi-help-circle-outline'

const categoryCards = computed(() =>
  [...HELP_CATEGORIES]
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ id: c.id, icon: c.icon, title: c.title[locale.value], description: c.description[locale.value], articles: articles.value.filter((a) => a.category === c.id) }))
    .filter((c) => c.articles.length > 0),
)

// Ana sayfa ızgarası: "Başlarken" (üstte yol olarak), SSS ve Destek (altta) ayrı gösterildiği için ızgarada tekrar edilmez.
const HOME_SEPARATE = ['getting-started', 'faq', 'support']
const topicCards = computed(() => categoryCards.value.filter((c) => !HOME_SEPARATE.includes(c.id)))
const faqItems = computed(() => {
  const block = getHelpArticle('faq-general', locale.value)?.body.find((b) => b.type === 'faq')
  return block && block.type === 'faq' ? block.items.slice(0, 5) : []
})

const startArticles = computed(() => articles.value.filter((a) => a.category === 'getting-started').slice(0, 3))
const POPULAR_IDS = ['ts-product-not-sent', 'ts-order-missing', 'stock-channel-policy', 'int-errors', 'app-shortcuts']
const popular = computed(() => POPULAR_IDS.map((id) => getHelpArticle(id, locale.value)).filter((a): a is NonNullable<typeof a> => !!a))

const relatedArticles = computed(() => (article.value?.related ?? []).map((id) => getHelpArticle(id, locale.value)).filter((a): a is NonNullable<typeof a> => !!a).slice(0, 4))

// ---- Arama ----
const results = computed(() => (trimmed.value.length >= 2 ? searchHelpArticles(trimmed.value, locale.value, 30) : []))
const resultsStatusId = 'ek-help-results-status'
const searchStatus = computed(() => {
  if (trimmed.value.length < 2) return ''
  return results.value.length ? `${results.value.length} makale bulundu` : 'Makale bulunamadı'
})
const searchField = ref<any>(null)
const resultList = ref<HTMLElement | null>(null)

function focusSearch() {
  searchField.value?.focus?.()
}
function focusResult(index: number) {
  const el = resultList.value?.querySelector<HTMLElement>(`[data-result-index="${index}"]`)
  el?.focus()
}
function openFirstResult() {
  const first = results.value[0]
  if (first) goArticle(first.article.id)
}

// ---- Makale açılınca odak ve kaydırma ----
const articleEl = ref<HTMLElement | null>(null)
watch(articleId, async (id, prev) => {
  if (!id || id === prev) return
  await nextTick()
  const el = articleEl.value
  el?.closest('.workplace-area')?.scrollTo?.({ top: 0 })
  el?.scrollIntoView?.({ block: 'start' })
  el?.focus({ preventScroll: true })
})

// ---- Faydalı mıydı (yalnız yerel) ----
const vote = computed(() => (article.value ? feedback.voteOf(article.value.id) : undefined))
function setVote(value: 'up' | 'down') {
  if (!article.value) return
  feedback.vote(article.value.id, vote.value === value ? null : value)
}

// ---- Destek ----
const ticketOpen = ref(false)
function onTicketView() {
  ticketOpen.value = false
  nav.openScreen('supports/TicketListView')
}

// Çalışma alanı sözleşmesi: sekme ilk açıldığında/yeniden etkinleştiğinde parametreler (adres yoksa) okunur.
function initialize(parameters?: Record<string, unknown>) {
  if (!onHelpRoute()) readFrom(parameters ?? props.parameters)
}
defineExpose({ initialize, activate: initialize })
</script>

<style scoped>
.ek-help-center {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-height: 100%;
  /* ADR-0015 Karar 6.2 — sayfa iç boşluğu: masaüstü 6, tablet 4, mobil 3. */
  padding: var(--ek-space-6) var(--ek-space-6) var(--ek-space-10);
}

@media (max-width: 1023px) {
  .ek-help-center {
    padding: var(--ek-space-4) var(--ek-space-4) var(--ek-space-8);
  }
}

@media (max-width: 599px) {
  .ek-help-center {
    padding: var(--ek-space-3) var(--ek-space-3) var(--ek-space-8);
  }
}

.ek-help-center__muted {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-table-size);
  line-height: 1.5;
}

/* ---- Arama bandı ---- */
.ek-help-center__search {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.ek-help-center__field {
  width: 100%;
  max-width: 640px;
}

.ek-help-center__search.is-hero {
  align-items: center;
  padding: var(--ek-space-8) var(--ek-space-6);
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-2xl);
  background:
    radial-gradient(120% 140% at 0% 0%, var(--ek-color-action-subtle) 0%, transparent 60%),
    var(--ek-color-surface);
  text-align: center;
}

.ek-help-center__hero-text {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}

.ek-help-center__hero-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-display-size);
  line-height: var(--ek-type-display-line);
  font-weight: var(--ek-type-display-weight);
  letter-spacing: var(--ek-type-display-tracking);
}

.ek-help-center__hero-sub {
  margin: 0;
  color: var(--ek-color-content-muted);
}

.ek-help-center__search.is-hero .ek-help-center__field :deep(.v-field) {
  background: var(--ek-color-surface-raised);
  box-shadow: var(--ek-shadow-card);
}

.ek-help-center__popular {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-2);
  max-width: 760px;
}

.ek-help-center__popular-label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-help-center__chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-raised);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-help-center__chip:hover {
  border-color: var(--ek-color-action-border);
  color: var(--ek-color-action-emphasis);
  background: var(--ek-color-action-subtle);
}

/* ---- Ortak başlıklar ---- */
.ek-help-center__section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ek-space-1) var(--ek-space-3);
  margin-bottom: var(--ek-space-3);
}

.ek-help-center__h2 {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-help-center__h3 {
  margin: 0 0 var(--ek-space-3);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-help-center__home {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-8);
}

/* ---- Başlarken ---- */
.ek-help-center__start-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ek-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-help-center__start-card {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  width: 100%;
  height: 100%;
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-help-center__start-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-bold);
}

.ek-help-center__start-title,
.ek-help-center__cat-title,
.ek-help-center__result-title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-help-center__start-go {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin-top: auto;
  color: var(--ek-color-action);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-help-center__start-go .v-icon {
  font-size: var(--ek-icon-sm);
}

/* ---- Kategori ızgarası ---- */
.ek-help-center__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
  gap: var(--ek-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-help-center__cat {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  overflow: hidden;
}

.ek-help-center__cat-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-areas: 'icon text' 'icon count';
  gap: var(--ek-space-1) var(--ek-space-3);
  width: 100%;
  padding: var(--ek-space-4) var(--ek-space-4) var(--ek-space-3);
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-help-center__cat-head > :first-child {
  grid-area: icon;
}

.ek-help-center__cat-text {
  grid-area: text;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ek-help-center__cat-count {
  grid-area: count;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-help-center__cat-links {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: var(--ek-space-2) var(--ek-space-4) var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
  list-style: none;
}

.ek-help-center__cat-links {
  gap: 2px;
}

.ek-help-center__cat-link {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: 100%;
  min-height: 32px;
  margin: 0 calc(-1 * var(--ek-space-2));
  padding: var(--ek-space-1) var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-content-default);
  font: inherit;
  font-size: var(--ek-type-table-size);
  line-height: var(--ek-type-table-line);
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-help-center__cat-link-doc {
  flex: none;
  font-size: var(--ek-icon-sm);
  color: var(--ek-color-content-subtle);
}

.ek-help-center__cat-link-text {
  flex: 1;
  min-width: 0;
}

.ek-help-center__cat-link-go {
  flex: none;
  font-size: var(--ek-icon-sm);
  color: var(--ek-color-action);
  opacity: 0;
  transform: translateX(-4px);
  transition:
    opacity var(--ek-motion-feedback),
    transform var(--ek-motion-reveal);
}

.ek-help-center__cat-link:hover,
.ek-help-center__cat-link:focus-visible {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.ek-help-center__cat-link:hover .ek-help-center__cat-link-doc {
  color: var(--ek-color-action);
}

.ek-help-center__cat-link:hover .ek-help-center__cat-link-go,
.ek-help-center__cat-link:focus-visible .ek-help-center__cat-link-go {
  opacity: 1;
  transform: none;
}

.ek-help-center__cat-link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-help-center__cat-all {
  margin: auto var(--ek-space-4) var(--ek-space-3);
}

.ek-help-center__cat {
  transition:
    border-color var(--ek-motion-feedback),
    box-shadow var(--ek-motion-reveal);
}

.ek-help-center__cat:hover {
  border-color: var(--ek-color-border-default);
  box-shadow: var(--ek-shadow-raised);
}

.ek-help-center__inline-link {
  display: inline;
}

.ek-help-center__start-card:hover,
.ek-help-center__cat-head:hover,
.ek-help-center__result:hover,
.ek-help-center__category-item:hover,
.ek-help-center__related-card:hover {
  background: var(--ek-color-surface-muted);
}

.ek-help-center__start-card:hover,
.ek-help-center__related-card:hover {
  border-color: var(--ek-color-action-border);
}

.ek-help-center button:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

/* ---- Arama sonuçları ---- */
.ek-help-center__results {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  max-width: 880px;
}

.ek-help-center__count {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-table-size);
}

.ek-help-center__result-list,
.ek-help-center__category-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  list-style: none;
  overflow: hidden;
}

.ek-help-center__result-list > li + li,
.ek-help-center__category-list > li + li {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-help-center__result {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  width: 100%;
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ek-help-center__result-cat {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-help-center__result-cat .v-icon {
  font-size: 14px;
}

.ek-help-center__result-summary {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-table-size);
  line-height: 1.5;
}

.ek-help-center__result-excerpt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: 1.5;
}

.ek-help-center__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-10) var(--ek-space-4);
  border: 1px dashed var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  text-align: center;
}




/* ---- Kategori + makale düzeni ---- */
.ek-help-center__layout {
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr);
  gap: var(--ek-space-6);
  align-items: start;
}

.ek-help-center__nav {
  position: sticky;
  /* FR2 madde 3: çalışma alanı artık kaydırma kabı → konu ağacı okurken görünür kalır. */
  top: var(--ek-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  max-height: calc(100vh - 200px);
  padding: var(--ek-space-2);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  overflow-y: auto;
}

.ek-help-center__nav-home {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 32px;
  padding: 0 var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-action);
  font: inherit;
  font-size: var(--ek-type-table-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
}

.ek-help-center__nav-home .v-icon {
  font-size: var(--ek-icon-sm);
}

.ek-help-center__nav-list,
.ek-help-center__nav-articles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-help-center__nav-articles {
  margin: 2px 0 var(--ek-space-2) 26px;
  padding-left: var(--ek-space-2);
  border-left: 1px solid var(--ek-color-border-subtle);
}

.ek-help-center__nav-cat,
.ek-help-center__nav-article {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: 100%;
  min-height: 32px;
  padding: var(--ek-space-1) var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-content-default);
  font: inherit;
  font-size: var(--ek-type-table-size);
  line-height: 1.35;
  text-align: left;
  cursor: pointer;
}

.ek-help-center__nav-cat .v-icon {
  flex: none;
  font-size: var(--ek-icon-sm);
  color: var(--ek-color-content-muted);
}

.ek-help-center__nav-cat:hover,
.ek-help-center__nav-article:hover {
  background: var(--ek-color-surface-muted);
}

.ek-help-center__nav-cat.is-current {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-help-center__nav-cat.is-current .v-icon {
  color: var(--ek-color-action);
}

.ek-help-center__nav-article.is-current {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-help-center__main {
  min-width: 0;
}

.ek-help-center__article,
.ek-help-center__category {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  max-width: 820px;
  outline: none;
}

.ek-help-center__crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-help-center__crumbs .v-icon {
  font-size: var(--ek-icon-sm);
  color: var(--ek-color-content-subtle);
}

.ek-help-center__article-head {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-4);
}

.ek-help-center__article-top {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding-bottom: var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ek-help-center__article-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-display-size);
  line-height: var(--ek-type-display-line);
  font-weight: var(--ek-type-display-weight);
  letter-spacing: var(--ek-type-display-tracking);
}

.ek-help-center__lead {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: 1.6;
}

.ek-help-center__goto {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  margin-top: var(--ek-space-1);
}

.ek-help-center__goto-off {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-help-center__goto-off .v-icon {
  font-size: 14px;
}

.ek-help-center__lang-note {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-help-center__category-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: 'title icon' 'summary icon';
  align-items: center;
  gap: 2px var(--ek-space-3);
  width: 100%;
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ek-help-center__category-item > :nth-child(2) {
  grid-area: summary;
}

.ek-help-center__category-item .v-icon {
  grid-area: icon;
  color: var(--ek-color-content-subtle);
}

/* ---- Geri bildirim ---- */
.ek-help-center__feedback {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-4);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
}

.ek-help-center__feedback-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-help-center__feedback-actions {
  display: flex;
  gap: var(--ek-space-2);
}

.ek-help-center__feedback :deep(.ek-btn.is-voted) {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.ek-help-center__feedback-msg {
  flex-basis: 100%;
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-help-center__feedback-msg:empty {
  display: none;
}

/* ---- İlgili ---- */
.ek-help-center__related ul {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-help-center__related-card {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  width: 100%;
  height: 100%;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

/* ---- Alt bant: SSS + destek ---- */
.ek-help-center__bottom {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
  gap: var(--ek-space-4);
  align-items: start;
}

.ek-help-center__faq .ek-help-center__section-head {
  justify-content: space-between;
}

/* ---- Duyarlı ---- */
@media (max-width: 1099px) {
  .ek-help-center__bottom {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 959px) {
  .ek-help-center__layout {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-3);
  }

  /* Dar ekranda konu ağacı yerine yalnız "Tüm konular" dönüşü (içerik ilk ekranda görünür). */
  .ek-help-center__nav {
    position: static;
    max-height: none;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .ek-help-center__nav-list {
    display: none;
  }

  .ek-help-center__nav-home {
    align-self: flex-start;
    padding: 0;
  }

  .ek-help-center__start-list {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 599px) {
  .ek-help-center__related ul {
    grid-template-columns: minmax(0, 1fr);
  }

  .ek-help-center__search.is-hero {
    padding: var(--ek-space-5) var(--ek-space-4);
  }

  .ek-help-center__hero-title,
  .ek-help-center__article-title {
    font-size: var(--ek-type-heading-size);
    line-height: var(--ek-type-heading-line);
  }

  .ek-help-center__popular {
    justify-content: flex-start;
  }

  .ek-help-center__search.is-hero {
    align-items: stretch;
    text-align: left;
  }
}
</style>
