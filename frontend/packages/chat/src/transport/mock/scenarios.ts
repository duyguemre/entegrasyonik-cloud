/**
 * Mock taşıyıcı senaryoları (CHAT_UI_CONTRACT.md §6). Veriler SENTETİKTİR (gerçek müşteri/ürün adı yok; müşteri adları
 * maskeli). Tetik sözcükleri Türkçe, küçük harf ve SÖZCÜK BAŞI eşleşir ("sil" → "silinsin" eşleşir, "kısıl" eşleşmez).
 * Liste sırası önceliktir: daha özgül tetik önce ("hızlı onay" → confirm-expire, "onayla" → approve-orders).
 */
import type {
  AppLink,
  ConfirmPart,
  EntityRef,
  FormPart,
  Part,
  ServerEvent,
  TableColumn,
  TableRow,
  TurnEndStatus,
  UnknownPart,
} from '../../protocol/v1'

export interface ScenarioContext {
  /** Hız çarpanlı bekleme (speed 0 → anında). İptal edilirse reddeder. */
  sleep(ms: number): Promise<void>
  now(): number
  /** Deterministik kimlik üretimi (tur içinde tekil). */
  nextId(prefix: string): string
  turnId: string
  messageId: string
  conversationId: string
  /** Onay kartı kaydı: kart onaylanınca/reddedilince çalışacak akış. */
  registerPending(action: PendingMockAction): void
  /** Tablo "daha fazla" sayfaları (token → sayfa üretici). */
  registerMore(token: string, page: () => { rows: TableRow[]; more: { token: string } | null; total: number | null }): void
  suggestions: Array<{ id: string; text: string }>
}

export interface PendingMockAction {
  pendingActionId: string
  messageId: string
  part: ConfirmPart
  approve(ctx: ConfirmContext): AsyncGenerator<ServerEvent>
  reject(ctx: ConfirmContext): AsyncGenerator<ServerEvent>
}

export interface ConfirmContext {
  sleep(ms: number): Promise<void>
  nextId(prefix: string): string
  turnId: string
}

/** Senaryo akışı. `turn.start`'ı KENDİSİ üretir (ör. `rate` HTTP hatası benzetiminde üretmez). */
export type ScenarioRun = (ctx: ScenarioContext) => AsyncGenerator<ServerEvent>

export interface MockScenario {
  id: string
  triggers: readonly string[]
  run: ScenarioRun
  /** Form yanıtı (`input.kind === 'form'`) bu formId için bu senaryoya gider. */
  formIds?: readonly string[]
  runForm?: ScenarioRun
}

// ---------- yardımcılar ----------

const start = (ctx: ScenarioContext): ServerEvent => ({ type: 'turn.start', turnId: ctx.turnId, conversationId: ctx.conversationId, messageId: ctx.messageId })
const part = (ctx: ScenarioContext | { messageId: string }, p: Part | UnknownPart): ServerEvent => ({ type: 'part', messageId: ctx.messageId, part: p })
const end = (turnId: string, status: TurnEndStatus = 'completed'): ServerEvent => ({ type: 'turn.end', turnId, status })
const text = (id: string, body: string, format: 'plain' | 'markdown' = 'markdown'): Part => ({ id, type: 'text', format, text: body })
const iso = (ms: number) => new Date(ms).toISOString()

/** Deterministik küçük PRNG (mulberry32) — veriler her koşuda aynı. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CHANNELS = ['trendyol', 'hepsiburada', 'n11', 'pazarama'] as const
const ORDER_STATUSES = ['AWAITING_APPROVAL', 'AWAITING_APPROVAL', 'APPROVED', 'SHIPPED', 'UNAPPROVED'] as const
const CARRIERS = ['Yurtiçi', 'Aras', 'MNG', 'Sürat', 'PTT']
const INITIALS = 'ABCDEFGHİKLMNOPRSTUVYZ'

function maskedName(r: () => number) {
  const pick = () => INITIALS[Math.floor(r() * INITIALS.length)]
  return `${pick()}*** ${pick()}***`
}

export const ORDER_COLUMNS: TableColumn[] = [
  { key: 'order', label: 'Sipariş no', type: 'entity' },
  { key: 'channel', label: 'Kanal', type: 'channel' },
  { key: 'customer', label: 'Müşteri', type: 'text', untrusted: true },
  { key: 'amount', label: 'Tutar', type: 'money', currency: 'TRY' },
  { key: 'status', label: 'Durum', type: 'status', statusDomain: 'order' },
  { key: 'createdAt', label: 'Tarih', type: 'datetime' },
  { key: 'quantity', label: 'Adet', type: 'number' },
  { key: 'carrier', label: 'Kargo', type: 'text' },
]

/** Sentetik sipariş satırları (sayfa `page`, 25'er). Tarihler sabit bir tabandan geriye gider (deterministik). */
export function orderRows(page: number, size = 25): TableRow[] {
  const r = rng(1000 + page)
  const base = Date.UTC(2026, 8, 30, 9, 0, 0)
  return Array.from({ length: size }, (_, i) => {
    const n = page * size + i
    const number = `EK-${String(240001 + n)}`
    const ref: EntityRef = { type: 'order', id: `ord_${String(n + 1).padStart(5, '0')}`, label: number }
    return {
      order: ref,
      channel: CHANNELS[n % CHANNELS.length],
      customer: maskedName(r),
      amount: Math.round((150 + r() * 4200) * 100) / 100,
      status: ORDER_STATUSES[Math.floor(r() * ORDER_STATUSES.length)],
      createdAt: iso(base - n * 37 * 60 * 1000),
      quantity: 1 + Math.floor(r() * 4),
      carrier: CARRIERS[Math.floor(r() * CARRIERS.length)],
    }
  })
}

const ORDER_SAMPLE: EntityRef[] = [
  { type: 'order', id: 'ord_00001', label: 'EK-240001' },
  { type: 'order', id: 'ord_00002', label: 'EK-240002' },
  { type: 'order', id: 'ord_00003', label: 'EK-240003' },
]

async function* progressThen(ctx: ScenarioContext, label: string, doneDetail: string, capabilityId: string, ms = 400) {
  const id = ctx.nextId('p')
  yield part(ctx, { id, type: 'progress', label, capabilityId, state: 'running' })
  await ctx.sleep(ms)
  yield part(ctx, { id, type: 'progress', label, capabilityId, state: 'done', detail: doneDetail })
}

function approveOrdersCard(ctx: ScenarioContext, overrides: Partial<ConfirmPart> = {}): ConfirmPart {
  return {
    id: ctx.nextId('c'),
    type: 'confirm',
    pendingActionId: ctx.nextId('pa'),
    capabilityId: 'orders.approve',
    title: '3 siparişi onayla',
    summary: "3 sipariş Onaylandı durumuna geçecek ve Trendyol'a bildirilecek.",
    effect: 'write',
    risk: 'medium',
    external: true,
    affected: { count: 3, sample: ORDER_SAMPLE },
    changes: [{ label: 'Durum', from: 'Onay bekliyor', to: 'Onaylandı' }],
    confirmMode: 'confirm',
    expiresAt: iso(ctx.now() + 5 * 60 * 1000),
    state: 'pending',
    ...overrides,
  }
}

/** Standart onay/ret akışı: onay → executing → (800 ms) → done + sonuç; ret → rejected + "İşlem iptal edildi." */
function standardPending(ctx: ScenarioContext, card: ConfirmPart, doneMessage: string, openIn?: AppLink): PendingMockAction {
  const messageId = ctx.messageId
  return {
    pendingActionId: card.pendingActionId,
    messageId,
    part: card,
    async *approve(c) {
      yield { type: 'part', messageId, part: { ...card, state: 'executing' } }
      await c.sleep(800)
      yield { type: 'part', messageId, part: { ...card, state: 'done', result: { message: doneMessage, ...(openIn ? { openIn } : {}) } } }
      yield end(c.turnId)
    },
    async *reject(c) {
      yield { type: 'part', messageId, part: { ...card, state: 'rejected' } }
      yield { type: 'part', messageId, part: text(c.nextId('t'), 'İşlem iptal edildi.', 'plain') }
      yield end(c.turnId)
    },
  }
}

// ---------- senaryolar ----------

const LONG_REPORT = (() => {
  const intro = '### Haftalık satış raporu\n\nBu rapor sentetik demo verisiyle hazırlanmıştır. Kanallara göre öne çıkanlar:\n\n'
  const lines: string[] = []
  const r = rng(7)
  for (let i = 0; i < 18; i++) {
    const ch = ['Trendyol', 'Hepsiburada', 'N11', 'Pazarama'][i % 4]
    lines.push(`- **${ch}** tarafında ${i + 3}. günde sipariş hacmi yüzde ${Math.round(r() * 20 + 2)} değişti; iade oranı sakin seyretti ve stok uyarısı gerektiren ürün sayısı ${Math.round(r() * 9 + 1)} oldu.`)
  }
  const outro = '\n\n#### Öneri\n\nStok uyarısı veren ürünler için tedarik planını gözden geçirin; `stok < 5` olan kalemleri öncelikli sipariş edin. Kampanya dönemlerinde fiyat değişikliklerini tek tek değil toplu önizleme ile yapmak hata riskini azaltır.'
  let body = intro + lines.join('\n') + outro
  while (body.length < 2500) body += ' Değerlendirme sürüyor.'
  return body.slice(0, 2500)
})()

export const SCENARIOS: MockScenario[] = [
  {
    id: 'confirm-expire',
    triggers: ['hızlı onay'],
    async *run(ctx) {
      yield start(ctx)
      const card = approveOrdersCard(ctx, { title: '1 siparişi onayla', summary: '1 sipariş Onaylandı durumuna geçecek.', affected: { count: 1, sample: ORDER_SAMPLE.slice(0, 1) }, external: false, risk: 'low', expiresAt: iso(ctx.now() + 10 * 1000) })
      ctx.registerPending(standardPending(ctx, card, '1 sipariş onaylandı.'))
      yield part(ctx, card)
      yield end(ctx.turnId, 'awaiting-confirm')
    },
  },
  {
    id: 'delete-typed',
    triggers: ['sil'],
    async *run(ctx) {
      yield start(ctx)
      const card: ConfirmPart = {
        id: ctx.nextId('c'),
        type: 'confirm',
        pendingActionId: ctx.nextId('pa'),
        capabilityId: 'products.delete',
        title: '2 ürünü sil',
        summary: '2 taslak ürün kalıcı olarak silinecek. Bu işlem geri alınamaz.',
        effect: 'destructive',
        risk: 'high',
        external: false,
        affected: { count: 2, sample: [{ type: 'product', id: 'prd_0101', label: 'Demo Pamuk Tişört (taslak)' }, { type: 'product', id: 'prd_0102', label: 'Demo Keten Gömlek (taslak)' }] },
        confirmMode: 'typed',
        typedPhrase: 'SİL 2',
        expiresAt: iso(ctx.now() + 5 * 60 * 1000),
        state: 'pending',
      }
      ctx.registerPending(standardPending(ctx, card, '2 ürün silindi.', { screen: 'productDefinitions/ProductListView' }))
      yield part(ctx, card)
      yield end(ctx.turnId, 'awaiting-confirm')
    },
  },
  {
    id: 'price-form',
    triggers: ['fiyat güncelle'],
    formIds: ['price-update'],
    async *run(ctx) {
      yield start(ctx)
      yield part(ctx, text(ctx.nextId('t'), 'Fiyatı güncellemek için aşağıdaki bilgileri doldurun. Göndermeden önce değişikliği size gösterip onayınızı alacağım.', 'plain'))
      const form: FormPart = {
        id: ctx.nextId('f'),
        type: 'form',
        formId: 'price-update',
        capabilityId: 'products.price.update',
        title: 'Fiyat güncelle',
        fields: [
          { name: 'product', label: 'Ürün', required: true, kind: 'entity', entityType: 'product', help: 'Ürün kimliği, ör. prd_0001' },
          { name: 'price', label: 'Yeni fiyat', required: true, kind: 'money', currency: 'TRY', min: 0 },
          { name: 'channels', label: 'Kanallar', required: true, kind: 'select', multiple: true, options: [{ value: 'trendyol', label: 'Trendyol' }, { value: 'hepsiburada', label: 'Hepsiburada' }, { value: 'n11', label: 'N11' }] },
        ],
        submitLabel: 'Önizle',
        state: 'open',
        expiresAt: iso(ctx.now() + 10 * 60 * 1000),
      }
      yield part(ctx, form)
      yield end(ctx.turnId, 'awaiting-input')
    },
    async *runForm(ctx) {
      yield start(ctx)
      const card = approveOrdersCard(ctx, {
        capabilityId: 'products.price.update',
        title: 'Fiyatı güncelle',
        summary: 'Seçili ürünün fiyatı seçtiğiniz kanallarda güncellenecek.',
        risk: 'medium',
        external: true,
        affected: { count: 1, sample: [{ type: 'product', id: 'prd_0001', label: 'Demo Pamuk Tişört' }] },
        changes: [{ label: 'Fiyat', from: '₺349,90', to: 'Yeni fiyat' }],
      })
      ctx.registerPending(standardPending(ctx, card, 'Fiyat güncellendi.', { screen: 'productDefinitions/ProductListView' }))
      yield part(ctx, card)
      yield end(ctx.turnId, 'awaiting-confirm')
    },
  },
  {
    id: 'live-readonly',
    triggers: ['pazaryerine gönder'],
    async *run(ctx) {
      yield start(ctx)
      yield* progressThen(ctx, 'Gönderim hazırlanıyor', 'hazır', 'products.publish', 300)
      yield part(ctx, { id: ctx.nextId('e'), type: 'error', code: 'LIVE_READONLY', message: 'Salt-okuma kipinde dış sisteme yazılamaz.', retryable: false })
      yield end(ctx.turnId)
    },
  },
  {
    id: 'approve-orders',
    triggers: ['onayla'],
    async *run(ctx) {
      yield start(ctx)
      yield* progressThen(ctx, 'Onay bekleyen siparişler getiriliyor', '3 kayıt', 'orders.list', 300)
      yield part(ctx, text(ctx.nextId('t'), '3 sipariş için onayınız gerekiyor.', 'plain'))
      const card = approveOrdersCard(ctx)
      ctx.registerPending(standardPending(ctx, card, '3 sipariş onaylandı.', { screen: 'OrderListView', params: { internalStatuses: 'APPROVED' } }))
      yield part(ctx, card)
      yield end(ctx.turnId, 'awaiting-confirm')
    },
  },
  {
    id: 'denied',
    triggers: ['yetki'],
    async *run(ctx) {
      yield start(ctx)
      yield {
        type: 'error',
        error: { code: 'FORBIDDEN', message: 'Bu işlem için yetkiniz yok — yöneticinizden yetki isteyin.', retryable: false, supportCode: 'EK-DEMO-4031', action: { kind: 'open', link: { screen: 'settings/team' }, label: 'Yetkiler' } },
      }
    },
  },
  {
    id: 'rate',
    triggers: ['çok hızlı'],
    // HTTP 429 benzetimi: SSE başlamadan tek error olayı (turn.start YOK — sse taşıyıcısıyla aynı biçim).
    async *run() {
      yield { type: 'error', error: { code: 'RATE_LIMITED', message: 'Çok hızlı mesaj gönderdiniz — birkaç saniye bekleyip yeniden deneyin.', retryable: true, action: { kind: 'retry' } } }
    },
  },
  {
    id: 'interrupted',
    triggers: ['kopma'],
    async *run(ctx) {
      yield start(ctx)
      const id = ctx.nextId('t')
      yield part(ctx, { ...text(id, ''), streaming: true })
      for (const chunk of ['Siparişleri ', 'inceliyorum; ', 'ilk sonuçlar ']) {
        await ctx.sleep(120)
        yield { type: 'delta', messageId: ctx.messageId, partId: id, text: chunk }
      }
      // turn.end yok → taşıyıcı STREAM_INTERRUPTED üretir.
    },
  },
  {
    id: 'long-stream',
    triggers: ['rapor', 'uzun'],
    async *run(ctx) {
      yield start(ctx)
      const id = ctx.nextId('t')
      yield part(ctx, { ...text(id, ''), streaming: true })
      const size = Math.ceil(LONG_REPORT.length / 120)
      for (let i = 0; i < LONG_REPORT.length; i += size) {
        await ctx.sleep(40)
        yield { type: 'delta', messageId: ctx.messageId, partId: id, text: LONG_REPORT.slice(i, i + size) }
      }
      yield part(ctx, { ...text(id, LONG_REPORT), streaming: false })
      yield end(ctx.turnId)
    },
  },
  {
    id: 'unknown-part',
    triggers: ['yeni tür'],
    async *run(ctx) {
      yield start(ctx)
      yield part(ctx, { id: ctx.nextId('x'), type: 'chart', series: [1, 2, 3] })
      yield part(ctx, text(ctx.nextId('t'), 'Grafik türü bu sürümde desteklenmiyor; yukarıda yedek görünüm gösterildi.', 'plain'))
      yield end(ctx.turnId)
    },
  },
  {
    id: 'llm-key-invalid',
    triggers: ['anahtar'],
    async *run(ctx) {
      yield start(ctx)
      yield { type: 'error', error: { code: 'LLM_KEY_INVALID', message: 'Yapay zekâ sağlayıcı anahtarı geçersiz — kurulumu açıp anahtarı yenileyin.', retryable: false, action: { kind: 'setup' } } }
    },
  },
  {
    id: 'llm-rate',
    triggers: ['yoğun'],
    async *run(ctx) {
      yield start(ctx)
      yield { type: 'error', error: { code: 'LLM_RATE_LIMITED', message: 'Sağlayıcı şu an yoğun — 20 sn sonra tekrar deneyin.', retryable: true, action: { kind: 'retry' } } }
    },
  },
  {
    id: 'sales-kpi',
    triggers: ['satış', 'ciro'],
    async *run(ctx) {
      yield start(ctx)
      yield* progressThen(ctx, 'Satış göstergeleri hesaplanıyor', 'son 7 gün', 'reports.sales.summary', 350)
      yield part(ctx, {
        id: ctx.nextId('k'),
        type: 'kpi',
        title: 'Son 7 gün',
        items: [
          { key: 'revenue', label: 'Ciro', value: 184250.4, format: 'money', currency: 'TRY', delta: { value: 0.082, direction: 'up', good: true } },
          { key: 'orders', label: 'Sipariş', value: 612, format: 'number', delta: { value: 0.041, direction: 'up', good: true } },
          { key: 'aov', label: 'Ortalama sepet', value: 301.06, format: 'money', currency: 'TRY', delta: { value: 0, direction: 'flat', good: true } },
          { key: 'returns', label: 'İade oranı', value: 0.036, format: 'percent', delta: { value: 0.007, direction: 'down', good: false } },
        ],
        openIn: { screen: 'DashboardView' },
      })
      yield part(ctx, text(ctx.nextId('t'), 'Ciro geçen haftaya göre **%8,2** arttı. İade oranındaki değişimi izlemenizi öneririm.'))
      yield end(ctx.turnId)
    },
  },
  {
    id: 'orders-table',
    triggers: ['onay bekleyen', 'sipariş'],
    async *run(ctx) {
      yield start(ctx)
      yield* progressThen(ctx, 'Siparişler getiriliyor', '25 kayıt', 'orders.list', 400)
      const token = `more:${ctx.messageId}:1`
      let page = 1
      const register = (t: string) =>
        ctx.registerMore(t, () => {
          const rows = orderRows(page)
          page += 1
          const next = page <= 3 ? `more:${ctx.messageId}:${page}` : null
          if (next) register(next)
          return { rows, more: next ? { token: next } : null, total: 132 }
        })
      register(token)
      yield part(ctx, {
        id: ctx.nextId('tb'),
        type: 'table',
        title: 'Onay bekleyen siparişler',
        capabilityId: 'orders.list',
        columns: ORDER_COLUMNS,
        rowKey: 'order',
        rows: orderRows(0),
        total: 132,
        more: { token },
        openIn: { screen: 'OrderListView', params: { internalStatuses: 'AWAITING_APPROVAL' } },
      })
      yield part(ctx, text(ctx.nextId('t'), 'Onay bekleyen **132** sipariş var; en eski 25 tanesini listeledim. Çoğu *Trendyol* ve *Hepsiburada* kanalında.'))
      yield end(ctx.turnId)
    },
  },
  {
    id: 'entity',
    triggers: ['ürün', 'stok'],
    async *run(ctx) {
      yield start(ctx)
      yield part(ctx, {
        id: ctx.nextId('el'),
        type: 'entity-link',
        entity: { type: 'product', id: 'prd_0001', label: 'Demo Pamuk Tişört' },
        link: { screen: 'productDefinitions/ProductListView' },
        description: 'Stok seviyesi kritik eşiğin altında; iki kanalda satışta.',
        fields: [
          { label: 'Stok kodu', value: 'DEMO-TS-001', type: 'text' },
          { label: 'Fiyat', value: '349.90', type: 'money' },
          { label: 'Stok', value: '4 adet', type: 'text' },
          { label: 'Son güncelleme', value: '2026-09-29T14:20:00.000Z', type: 'date' },
        ],
      })
      yield part(ctx, text(ctx.nextId('t'), 'Bu ürünün stoğu 5 adedin altına düştü. Tedarik planı için stok sağlığı ekranına bakabilirsiniz.', 'plain'))
      yield end(ctx.turnId)
    },
  },
]

/** Eşleşme yoksa: "Bu demo şu soruları yanıtlar:" + öneriler. */
export const FALLBACK: MockScenario = {
  id: 'fallback',
  triggers: [],
  async *run(ctx) {
    yield start(ctx)
    const list = ctx.suggestions.map((s) => `- ${s.text}`).join('\n')
    yield part(ctx, text(ctx.nextId('t'), `Bu demo şu soruları yanıtlar:\n\n${list}`))
    yield end(ctx.turnId)
  },
}

export const DEFAULT_SUGGESTIONS = [
  { id: 's-orders', text: 'Onay bekleyen siparişleri göster' },
  { id: 's-sales', text: 'Bu haftaki satış özetini ver' },
  { id: 's-approve', text: 'İlk 3 siparişi onayla' },
  { id: 's-stock', text: 'Stoğu azalan ürün hangisi?' },
  { id: 's-price', text: 'Bir ürünün fiyat güncelle' },
  { id: 's-report', text: 'Haftalık rapor hazırla' },
]

const fold = (s: string) => s.toLocaleLowerCase('tr-TR')

/** Tetik sözcük başında eşleşmeli ("sil" → "sil", "silinsin"; "kısıl" DEĞİL). */
export function matchScenario(input: string, scenarios: readonly MockScenario[] = SCENARIOS): MockScenario | undefined {
  const hay = fold(input)
  return scenarios.find((s) =>
    s.triggers.some((trigger) => {
      const needle = fold(trigger)
      let at = hay.indexOf(needle)
      while (at !== -1) {
        if (at === 0 || /[\s.,;:!?'"«»()\-/]/.test(hay[at - 1])) return true
        at = hay.indexOf(needle, at + 1)
      }
      return false
    }),
  )
}
