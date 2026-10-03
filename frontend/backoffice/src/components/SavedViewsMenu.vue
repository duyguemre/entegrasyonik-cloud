<!--
  SavedViewsMenu — BE-05 kayıtlı görünümler: bu ekranın (route.meta.screen) süzgeç/sekme sorgusunu adla kaydeder, listeler, açar, siler.
  Kişisel tercihtir: step-up/gerekçe yok. Yalnız URL sorgusu kaydedilir (NT-03). `CopyViewLink` "Görünüm" grubunun parçasıdır.
  bo-wdg: silme onaysızdır ama geri alınabilir (toast "Geri al" aynı adla yeniden kaydeder); odak sonraki satıra geçer.
-->
<template>
  <v-menu v-if="screen" v-model="open" :close-on-content-click="false" location="bottom end" :offset="6">
    <template #activator="{ props: menu }">
      <EkButton v-bind="menu" tone="secondary" icon="mdi-bookmark-multiple-outline" data-testid="saved-views-trigger" aria-label="Kayıtlı görünümler" :aria-expanded="open">
        <span class="bo-views__text">Görünümler</span>
      </EkButton>
    </template>
    <div ref="menuEl" class="bo-views" data-testid="saved-views-menu" role="group" aria-label="Kayıtlı görünümler">
      <p class="bo-views__label">Bu ekranın görünümleri</p>

      <p v-if="loading" class="bo-views__note" role="status">Görünümler okunuyor…</p>
      <p v-else-if="loadFailed" class="bo-views__note" role="alert">
        Görünümler okunamadı — <button type="button" class="bo-views__link" @click="load">yeniden deneyin</button>.
      </p>
      <p v-else-if="!items.length" class="bo-views__note" data-testid="saved-views-empty">Bu ekranda kayıtlı görünüm yok.</p>
      <ul v-else class="bo-views__list">
        <li v-for="v in items" :key="v.id" class="bo-views__row" :data-view-name="v.name">
          <button type="button" class="bo-views__item" @click="apply(v)">
            <v-icon icon="mdi-bookmark-outline" aria-hidden="true" />
            <span class="bo-views__name">{{ v.name }}</span>
          </button>
          <button type="button" class="bo-views__del" :aria-label="`${v.name} görünümünü sil`" :disabled="busyId === v.id" @click="remove(v)">
            <v-icon icon="mdi-delete-outline" aria-hidden="true" />
          </button>
        </li>
      </ul>

      <form v-if="saving" class="bo-views__form" @submit.prevent="save">
        <label class="bo-views__field">
          <span>Görünüm adı</span>
          <input
            ref="nameInput"
            v-model="name"
            class="bo-views__input"
            type="text"
            maxlength="60"
            autocomplete="off"
            data-testid="saved-view-name"
            :aria-invalid="!!error"
            :aria-describedby="error ? errorId : undefined"
          />
        </label>
        <p v-if="error" :id="errorId" class="bo-views__error" role="alert" data-testid="saved-view-error">{{ error }}</p>
        <div class="bo-views__actions">
          <EkButton tone="ghost" size="sm" @click="cancel">Vazgeç</EkButton>
          <EkButton type="submit" tone="primary" size="sm" :loading="busy" data-testid="saved-view-submit">Kaydet</EkButton>
        </div>
      </form>
      <button v-else type="button" class="bo-views__item bo-views__item--add" data-testid="saved-view-add" @click="startSave">
        <v-icon icon="mdi-plus" aria-hidden="true" />
        <span>Bu görünümü kaydet…</span>
      </button>
      <p v-if="error && !saving" class="bo-views__error" role="alert">{{ error }}</p>
    </div>
  </v-menu>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkButton } from '@entegrasyonik/ui/components'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { api } from '@bo/api'
import { AdminApiError } from '@bo/api/client'
import { SAVED_VIEW_LIMIT, type SavedView } from '@bo/api/contracts/ops'

const route = useRoute()
const router = useRouter()

const SCREEN_RE = /^[a-z][a-z0-9-]{0,39}$/
/** Ekran anahtarı: yalnız ana ekran rotaları (detay rotalarında `name !== meta.screen`) ve geçerli desen. */
const screen = computed(() => {
  const s = route.meta.screen
  return typeof s === 'string' && SCREEN_RE.test(s) && route.name === s ? s : null
})

const open = ref(false)
const items = ref<SavedView[]>([])
const loading = ref(false)
const loadFailed = ref(false)
const saving = ref(false)
const name = ref('')
const busy = ref(false)
const busyId = ref<string | null>(null)
const error = ref('')
const nameInput = ref<HTMLInputElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const errorId = `bo-views-err-${useId()}`
const { showToast } = useToast()

const LIMIT_TEXT = `En çok ${SAVED_VIEW_LIMIT} görünüm kaydedebilirsiniz — eskilerden birini silin.`

/** Geçerli URL sorgusu → kaydedilecek model (boş/null değerler atılır). */
function currentQuery(): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const [k, v] of Object.entries(route.query)) {
    if (Array.isArray(v)) {
      const list = v.filter((x): x is string => typeof x === 'string')
      if (list.length) out[k] = list
    } else if (typeof v === 'string') out[k] = v
  }
  return out
}

async function load() {
  if (!screen.value) return
  loading.value = true
  loadFailed.value = false
  try {
    items.value = (await api.call('BackofficePrefsService/listViews', { screen: screen.value })).items
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

watch(open, (v) => {
  if (v) {
    error.value = ''
    void load()
  } else {
    saving.value = false
    name.value = ''
  }
})

function startSave() {
  error.value = ''
  saving.value = true
  void nextTick(() => nameInput.value?.focus())
}
function cancel() {
  saving.value = false
  error.value = ''
  name.value = ''
}

async function save() {
  const trimmed = name.value.trim()
  if (!trimmed) {
    error.value = 'Görünüme bir ad verin (en çok 60 karakter).'
    nameInput.value?.focus()
    return
  }
  busy.value = true
  error.value = ''
  try {
    await api.call('BackofficePrefsService/saveView', { screen: screen.value!, name: trimmed, query: currentQuery() })
    saving.value = false
    name.value = ''
    await load()
  } catch (e) {
    error.value =
      e instanceof AdminApiError && e.code === 'VIEW_LIMIT'
        ? LIMIT_TEXT
        : e instanceof AdminApiError && e.code === 'VALIDATION'
          ? 'Bu görünüm kaydedilemedi — ad ya da süzgeç değerlerini kontrol edin.'
          : 'Görünüm kaydedilemedi — birazdan yeniden deneyin.'
    // Hata alana bağlı (`aria-describedby`); odak düzeltme için alana döner.
    void nextTick(() => nameInput.value?.focus())
  } finally {
    busy.value = false
  }
}

/** Silinen satırın yerine odak: aynı sıradaki (sonraki) satır, yoksa bir önceki, liste boşsa "kaydet" düğmesi. */
function focusAfterRemove(index: number) {
  void nextTick(() => {
    const root = menuEl.value
    if (!root) return
    const rows = root.querySelectorAll<HTMLButtonElement>('.bo-views__list .bo-views__item')
    const target = rows[Math.min(index, rows.length - 1)] ?? root.querySelector<HTMLElement>('[data-testid="saved-view-add"]')
    target?.focus()
  })
}

/** "Geri al": aynı ad + sorguyla yeniden kaydeder (kimlik değişir; kişisel tercih olduğu için yeterli). */
async function restore(v: SavedView) {
  try {
    await api.call('BackofficePrefsService/saveView', { screen: v.screen, name: v.name, query: v.query })
    showToast({ tone: 'success', message: `"${v.name}" görünümü geri yüklendi.` })
    if (open.value) await load()
  } catch {
    showToast({ tone: 'error', message: `"${v.name}" geri yüklenemedi — görünümü yeniden kaydedin.` })
  }
}

async function remove(v: SavedView) {
  const index = items.value.findIndex((x) => x.id === v.id)
  busyId.value = v.id
  error.value = ''
  try {
    await api.call('BackofficePrefsService/deleteView', { id: v.id })
    await load()
    focusAfterRemove(Math.max(index, 0))
    showToast({ tone: 'success', message: `"${v.name}" görünümü silindi.`, actionLabel: 'Geri al', onAction: () => void restore(v), duration: 8000 })
  } catch {
    error.value = 'Görünüm silinemedi — birazdan yeniden deneyin.'
  } finally {
    busyId.value = null
  }
}

function apply(v: SavedView) {
  open.value = false
  void router.push({ query: v.query })
}
</script>

<style scoped>
.bo-views {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 260px;
  max-width: min(340px, calc(100vw - var(--ek-space-4)));
  padding: var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-popover);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-popover);
}

.bo-views__label {
  margin: 0;
  padding: var(--ek-space-1) var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-views__note {
  margin: 0;
  padding: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
}

.bo-views__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bo-views__row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.bo-views__item {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
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

.bo-views__item--add {
  flex: none;
  width: 100%;
  margin-top: var(--ek-space-1);
  border-top: 1px solid var(--ek-color-border-default);
  border-radius: 0 0 var(--ek-radius-md) var(--ek-radius-md);
  color: var(--ek-color-action);
}

.bo-views__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bo-views__del {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: var(--ek-color-content-muted);
  cursor: pointer;
}

.bo-views__item:hover,
.bo-views__del:hover {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.bo-views__item:focus-visible,
.bo-views__del:focus-visible,
.bo-views__link:focus-visible,
.bo-views__input:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 1px;
}

.bo-views__del:disabled {
  opacity: 0.5;
  cursor: default;
}

.bo-views__link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ek-color-action);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.bo-views__form {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin-top: var(--ek-space-1);
  padding: var(--ek-space-2);
  border-top: 1px solid var(--ek-color-border-default);
}

.bo-views__field {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
}

.bo-views__input {
  min-height: 36px;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font: inherit;
  font-size: var(--ek-type-body-size);
}

.bo-views__input[aria-invalid='true'] {
  border-color: var(--ek-color-error-emphasis);
}

.bo-views__error {
  margin: 0;
  padding: 0 var(--ek-space-2);
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-caption-size);
}

.bo-views__form .bo-views__error {
  padding: 0;
}

.bo-views__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ek-space-2);
}

@media (max-width: 599px) {
  .bo-views__text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}

/* ================= BO-LOCAL-01 — kayıtlı görünümler menüsü: uygulamanın tasarım diliyle =================
   Kart köşesi + ince çerçeve; başlık bandı sakin zeminde — kısa eylem çizgili mikro etiket; öğeler kutu köşeli,
   üzerine gelince eylem tonu; "kaydet" satırı ince çizgiyle ayrılan sakin altlık. */
.bo-views {
  gap: 0;
  padding: 0;
  overflow: hidden;
  border-radius: var(--ek-radius-card);
}

.bo-views__label {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
  line-height: var(--ek-type-micro-line);
}

.bo-views__label::before {
  content: '';
  flex: none;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.bo-views__note {
  padding: var(--ek-space-3) var(--ek-space-4);
  font-size: var(--ek-type-label-size);
}

.bo-views__list {
  padding: var(--ek-space-2);
}

.bo-views__item,
.bo-views__del {
  border-radius: var(--ek-radius-tile);
  font-size: var(--ek-type-label-size);
}

.bo-views__item:hover {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.bo-views__del:hover {
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.bo-views__item--add {
  min-height: 44px;
  margin-top: 0;
  padding: 0 var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-default);
  border-radius: 0;
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-views__form {
  margin-top: 0;
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-surface-muted);
}

.bo-views__input {
  border-color: var(--ek-color-border-input);
}

.bo-views__error {
  padding: var(--ek-space-2) var(--ek-space-4);
}
</style>
