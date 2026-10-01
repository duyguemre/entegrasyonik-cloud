<!--
  CommandPalette — Ctrl+K / ⌘K (ve metin alanı dışında "/") ile açılan komut paleti (BO_UI_PATTERNS §1.4).
  Kaynaklar: ekran kaydı (tüm ekranlar, "Yakında" dahil), hızlı geçişler (müşteri numarası → detay, istek kimliği →
  log/denetim araması) ve kabuk eylemleri (tema, kimlik doğrulama, çıkış). Tamamen klavyeyle: ↑/↓ seç, Enter aç, Esc kapat.
  Erişilebilirlik: combobox + listbox (`aria-activedescendant`), sonuç sayısı `aria-live` ile duyurulur.
-->
<template>
  <v-dialog v-model="open" max-width="640" class="bo-cmdk-dialog" content-class="bo-cmdk-wrap" aria-label="Komut paleti" @after-leave="query = ''">
    <div class="bo-cmdk">
      <div class="bo-cmdk__search">
        <v-icon icon="mdi-magnify" aria-hidden="true" />
        <input
          ref="inputRef"
          v-model="query"
          class="bo-cmdk__input"
          type="text"
          role="combobox"
          aria-expanded="true"
          :aria-controls="listId"
          :aria-activedescendant="flat[active] ? `${listId}-${active}` : undefined"
          aria-autocomplete="list"
          aria-label="Ekran, müşteri numarası ya da istek kimliği ara"
          placeholder="Ekran, müşteri numarası ya da istek kimliği ara…"
          autocomplete="off"
          spellcheck="false"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.enter.prevent="run(flat[active])"
        />
        <EkKbd :keys="['Esc']" />
      </div>
      <div :id="listId" class="bo-cmdk__list" role="listbox" aria-label="Sonuçlar">
        <template v-for="group in groups" :key="group.label">
          <p class="bo-cmdk__group" role="presentation">{{ group.label }}</p>
          <div
            v-for="item in group.items"
            :id="`${listId}-${item.index}`"
            :key="item.id"
            class="bo-cmdk__item"
            :class="{ 'is-active': item.index === active }"
            role="option"
            :aria-selected="item.index === active"
            @mousemove="active = item.index"
            @click="run(item)"
          >
            <v-icon class="bo-cmdk__icon" :icon="item.icon" aria-hidden="true" />
            <span class="bo-cmdk__label">{{ item.label }}</span>
            <span v-if="item.hint" class="bo-cmdk__hint">{{ item.hint }}</span>
            <EkStatusChip v-if="item.badge" :tone="item.badge.tone" :label="item.badge.text" />
            <EkKbd v-if="item.keys" class="bo-cmdk__keys" :keys="item.keys" />
          </div>
        </template>
        <p v-if="tenantSearching" class="bo-cmdk__empty" role="status">Müşteriler aranıyor…</p>
        <p v-else-if="!flat.length" class="bo-cmdk__empty">“{{ query }}” için sonuç yok. Mağaza adı, müşteri numarası (ör. 102) ya da istek kimliği deneyin.</p>
      </div>
      <p class="bo-cmdk__foot" aria-live="polite">
        <span><EkKbd :keys="['↑', '↓']" /> seç</span><span><EkKbd :keys="['Enter']" /> aç</span>
        <span class="bo-cmdk__count">{{ flat.length }} sonuç</span>
      </p>
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkKbd, EkStatusChip } from '@entegrasyonik/ui/components'
import type { StatusTone } from '@entegrasyonik/ui/components'
import { GROUPS, SCREENS, STATUS_BADGE, contextActionsFor } from '@bo/navigation/screens'
import { setThemePreference } from '@bo/theme'
import { requestReauth } from '@bo/auth/reauth'
import { session } from '@bo/auth/session'
import { api } from '@bo/api'
import { recents } from '@bo/navigation/recents'
import { CHAT_PRODUCT } from '@entegrasyonik/chat/brand'
import { otopilot } from '@bo/chat/otopilot'

const emit = defineEmits<{ logout: []; shortcuts: [] }>()
const router = useRouter()
const route = useRoute()
const open = defineModel<boolean>({ default: false })
const query = ref('')
const active = ref(0)
const inputRef = ref<HTMLInputElement>()
const listId = `bo-cmdk-${useId()}`

interface Cmd {
  id: string
  group: string
  label: string
  icon: string
  hint?: string
  badge?: { text: string; tone: StatusTone }
  /** Doğrudan kısayol (ör. G M) — satırın sonunda gösterilir. */
  keys?: string[]
  terms: string
  /** Sıralama için: etiket (ve ekran için grup + anahtar sözcükler). */
  primary?: string
  run: () => void
}

const norm = (s: string) => s.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')

const screenCmds = computed<Cmd[]>(() =>
  SCREENS.map((s) => {
    const group = GROUPS.find((g) => g.key === s.group)!
    const badge = STATUS_BADGE[s.status]
    return {
      id: `screen:${s.key}`,
      group: 'Ekranlar',
      label: s.label,
      icon: s.icon,
      hint: group.label !== s.label ? group.label : undefined,
      badge: badge ?? undefined,
      keys: s.hotkey && s.status !== 'planned' ? ['G', s.hotkey.toUpperCase()] : undefined,
      terms: norm([s.label, group.label, s.lede, ...(s.keywords ?? [])].join(' ')),
      primary: norm([s.label, group.label, ...(s.keywords ?? [])].join(' ')),
      run: () => router.push(s.path),
    }
  }),
)

const actionCmds: Cmd[] = [
  { id: 'theme:dark', group: 'Eylemler', label: 'Koyu temaya geç', icon: 'mdi-weather-night', terms: norm('tema koyu dark karanlık'), run: () => setThemePreference('dark') },
  { id: 'theme:light', group: 'Eylemler', label: 'Açık temaya geç', icon: 'mdi-white-balance-sunny', terms: norm('tema açık light'), run: () => setThemePreference('light') },
  { id: 'theme:system', group: 'Eylemler', label: 'Temayı sisteme bırak', icon: 'mdi-monitor', terms: norm('tema sistem system'), run: () => setThemePreference('system') },
  {
    id: 'reauth',
    group: 'Eylemler',
    label: 'Kimliği şimdi doğrula',
    icon: 'mdi-shield-key-outline',
    hint: 'Hassas işlemler için 5 dk',
    terms: norm('kimlik doğrula step-up reauth yeniden doğrulama güvenlik'),
    run: async () => {
      if (await requestReauth()) await session.refresh()
    },
  },
  { id: 'shortcuts', group: 'Eylemler', label: 'Klavye kısayolları', icon: 'mdi-keyboard-outline', keys: ['?'], terms: norm('klavye kısayol kısayollar yardım shortcut keyboard'), run: () => emit('shortcuts') },
  { id: 'logout', group: 'Eylemler', label: 'Çıkış yap', icon: 'mdi-logout', terms: norm('çıkış logout oturumu kapat'), run: () => emit('logout') },
]

/** Bir müşteri için iz eylemleri (BO-ELEV E2/E5): detay, olay akışı, denetim — aynı süzgeçlerle. */
function tenantCmds(tid: number, group: string, name?: string): Cmd[] {
  const who = name ? `${name} #${tid}` : `Müşteri #${tid}`
  const q = { tid: String(tid) }
  return [
    { id: `tenant:${tid}`, group, label: `${who} — detayı aç`, icon: 'mdi-storefront-outline', terms: '', run: () => router.push(`/musteriler/${tid}`) },
    { id: `tenant-logs:${tid}`, group, label: `${who} — olay akışı`, icon: 'mdi-pulse', terms: '', run: () => router.push({ path: '/loglar', query: q }) },
    { id: `tenant-audit:${tid}`, group, label: `${who} — denetim kayıtları`, icon: 'mdi-shield-search', terms: '', run: () => router.push({ path: '/denetim', query: q }) },
  ]
}

// Mağaza adıyla arama: ≥ 2 harf, sayı değil → AdminService/getClients (sunucu araması, en çok 5). Eski yanıt yok sayılır.
const tenantHits = ref<Array<{ tid: number; name: string }>>([])
const tenantSearching = ref(false)
let searchSeq = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(query, (raw) => {
  const q = raw.trim()
  clearTimeout(searchTimer)
  const seq = ++searchSeq
  if (q.length < 2 || /^#?\d+$/.test(q) || q.length > 60) {
    tenantHits.value = []
    tenantSearching.value = false
    return
  }
  tenantSearching.value = true
  searchTimer = setTimeout(async () => {
    try {
      const res = await api.call('AdminService/getClients', { search: q, limit: 5, sortField: 'order', sortOrder: 1 })
      if (seq === searchSeq) tenantHits.value = res.clients.map((c) => ({ tid: c.clientId, name: c.title || c.name || `#${c.clientId}` }))
    } catch {
      if (seq === searchSeq) tenantHits.value = []
    } finally {
      if (seq === searchSeq) tenantSearching.value = false
    }
  }, 200)
})
const tenantNameCmds = computed<Cmd[]>(() =>
  tenantHits.value.map((t) => ({ id: `tenant:${t.tid}`, group: 'Müşteriler', label: t.name, icon: 'mdi-storefront-outline', hint: `#${t.tid}`, terms: '', run: () => router.push(`/musteriler/${t.tid}`) })),
)

// Boş sorguda ilk grup: son açılanlar (bulunduğunuz ekran hariç).
const recentCmds = computed<Cmd[]>(() =>
  recents.value
    .filter((r) => !(r.kind === 'screen' && r.key === route.meta.screen && route.name === r.key) && !(r.kind === 'tenant' && route.name === 'tenant' && Number(route.params.tid) === r.tid))
    .flatMap((r): Cmd[] => {
      if (r.kind === 'tenant') return [{ id: `recent-tenant:${r.tid}`, group: 'Son açılanlar', label: `Müşteri #${r.tid}`, icon: 'mdi-storefront-outline', terms: '', run: () => router.push(`/musteriler/${r.tid}`) }]
      const sc = screenCmds.value.find((c) => c.id === `screen:${r.key}`)
      return sc ? [{ ...sc, id: `recent-${sc.id}`, group: 'Son açılanlar' }] : []
    })
    .slice(0, 5),
)

/** Sorguya göre hızlı geçişler: müşteri numarası ya da istek kimliği. */
const jumpCmds = computed<Cmd[]>(() => {
  const q = query.value.trim()
  const out: Cmd[] = []
  const tid = /^#?(\d{1,9})$/.exec(q)?.[1]
  if (tid) out.push(...tenantCmds(Number(tid), 'Hızlı geçiş'))
  // İstek kimliği: en az 8 karakter ve en az bir rakam ("kuyruk" gibi sözcükler eşleşmez).
  if (!tid && /^[A-Za-z0-9:_.-]{8,128}$/.test(q) && /\d/.test(q)) {
    out.push({ id: `req:${q}`, group: 'Hızlı geçiş', label: `İstek kimliğiyle loglarda ara: ${q}`, icon: 'mdi-transit-connection-horizontal', terms: '', run: () => router.push({ path: '/loglar', query: { reqId: q } }) })
    out.push({ id: `audit:${q}`, group: 'Hızlı geçiş', label: `Denetim kayıtlarında ara: ${q}`, icon: 'mdi-shield-search', terms: '', run: () => router.push({ path: '/denetim', query: { reqId: q } }) })
  }
  return out
})

// NT-01: "Bu ekranda" — bulunulan ekranın 1–3 bağlam eylemi; boş sorguda en üstte, sorguda etikete göre süzülür.
const contextCmds = computed<Cmd[]>(() =>
  contextActionsFor(route).map((a) => ({ id: `ctx:${a.id}`, group: 'Bu ekranda', label: a.label, icon: a.icon, terms: norm(a.label), primary: norm(a.label), run: () => router.push(a.to) })),
)

// Sıra: etiket başı eşleşme → etiket/grup/anahtar sözcük → yalnız açıklama. Eşitlikte kayıt sırası korunur.
function rank(c: Cmd, q: string): number {
  const label = norm(c.label)
  if (label.startsWith(q)) return 0
  if (label.includes(q)) return 1
  if ((c.primary ?? '').includes(q)) return 2
  return 3
}

const results = computed(() => {
  const q = norm(query.value.trim())
  const pick = (list: Cmd[]) =>
    q
      ? list
          .filter((c) => c.terms.includes(q))
          .map((c, i) => ({ c, r: rank(c, q), i }))
          .sort((a, b) => a.r - b.r || a.i - b.i)
          .map((x) => x.c)
      : list
  // Otopilot'a sor: sorgu ≥ 2 karakter ve sohbet erişilebilirken EN ÜSTTE (web paletiyle aynı davranış).
  const raw = query.value.trim()
  const ask: Cmd[] =
    raw.length >= 2 && otopilot.available.value
      ? [{ id: 'otopilot:ask', group: CHAT_PRODUCT.name, label: `${CHAT_PRODUCT.name}'a sor: «${raw.slice(0, 120)}»`, icon: 'mdi-creation-outline', hint: 'salt okuma', terms: '', run: () => otopilot.open({ via: 'palette', text: raw.slice(0, 4000) }) }]
      : []
  return [...ask, ...jumpCmds.value, ...pick(contextCmds.value), ...(q ? [] : recentCmds.value), ...tenantNameCmds.value, ...pick(screenCmds.value), ...pick(actionCmds)]
})

const flat = computed(() => results.value.map((c, index) => ({ ...c, index })))
const groups = computed(() => {
  const map = new Map<string, typeof flat.value>()
  for (const c of flat.value) map.set(c.group, [...(map.get(c.group) ?? []), c])
  return [...map].map(([label, items]) => ({ label, items }))
})

watch(query, () => (active.value = 0))
watch(open, async (v) => {
  if (!v) return
  active.value = 0
  await nextTick()
  inputRef.value?.focus()
})

function move(delta: number) {
  const n = flat.value.length
  if (!n) return
  active.value = (active.value + delta + n) % n
  document.getElementById(`${listId}-${active.value}`)?.scrollIntoView({ block: 'nearest' })
}

function run(cmd: Cmd | undefined) {
  if (!cmd) return
  open.value = false
  cmd.run()
}

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    open.value = !open.value
  } else if (e.key === '/' && !typing && !open.value) {
    e.preventDefault()
    open.value = true
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<style>
/* Teleport edilir → scoped değil; yalnız .bo-cmdk ile sınırlı. */
.bo-cmdk-dialog .bo-cmdk-wrap {
  align-self: flex-start;
  margin-top: 12vh;
}

.bo-cmdk {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: 70vh;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-dialog);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-dialog);
}

.bo-cmdk__search {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  color: var(--ek-color-content-muted);
}

.bo-cmdk__input {
  flex: 1;
  min-width: 0;
  height: 36px;
  border: 0;
  background: transparent;
  color: var(--ek-color-content-strong);
  font: inherit;
  font-size: var(--ek-type-body-size);
  outline: none;
}

.bo-cmdk__input::placeholder {
  color: var(--ek-color-content-muted);
}

.bo-cmdk__list {
  overflow-y: auto;
  padding: var(--ek-space-2);
}

.bo-cmdk__group {
  margin: var(--ek-space-2) var(--ek-space-2) var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-cmdk__item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 40px;
  padding: 0 var(--ek-space-3);
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  cursor: pointer;
}

.bo-cmdk__item.is-active {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-content-strong);
  box-shadow: inset 2px 0 0 var(--ek-color-action);
}

.bo-cmdk__icon {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
}

.bo-cmdk__item.is-active .bo-cmdk__icon {
  color: var(--ek-color-action-emphasis);
}

.bo-cmdk__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bo-cmdk__hint {
  margin-left: auto;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  white-space: nowrap;
}

.bo-cmdk__hint + .ek-status-chip,
.bo-cmdk__label + .ek-status-chip {
  margin-left: var(--ek-space-2);
}

.bo-cmdk__label + .ek-status-chip {
  margin-left: auto;
}

.bo-cmdk__keys {
  margin-left: var(--ek-space-2);
  opacity: 0.8;
}

.bo-cmdk__hint + .bo-cmdk__keys,
.bo-cmdk__label + .bo-cmdk__keys {
  margin-left: auto;
}

.bo-cmdk__empty {
  margin: 0;
  padding: var(--ek-space-6) var(--ek-space-4);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  text-align: center;
}

.bo-cmdk__foot {
  display: flex;
  align-items: center;
  gap: var(--ek-space-4);
  margin: 0;
  padding: var(--ek-space-2) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-cmdk__foot span {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.bo-cmdk__count {
  margin-left: auto;
}
</style>
