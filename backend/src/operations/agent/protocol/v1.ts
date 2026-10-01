/**
 * chat/v1 protokolu (ADR-0034 Karar 3; docs/cloud-contracts/CHAT_UI_CONTRACT.md §4) -- zod karsiligi.
 * KANONIK dosya frontend/packages/chat/src/protocol/v1.ts; bu dosya onun BIREBIR kopyasidir (ilk yorum blogu haric).
 * Elle DEGISTIRILMEZ: degisiklik onyuzde yapilir, `node scripts/sync-chat-protocol.cjs` ile kopyalanir
 * (tests/static/chatProtocol.static.test.ts iki dosyanin esitligini dogrular). Yalniz 'zod' ice aktarilir.
 */
import { z } from 'zod'

export const CHAT_PROTOCOL_VERSION = 1 as const

// ---------- Ortak ----------

const str = (max: number) => z.string().max(max)
const id = (max = 64) => z.string().min(1).max(max)
const isoDateTime = z.string().datetime({ offset: true })
const uuid = z.string().uuid()
const count = z.number().int().nonnegative()
const V = z.literal(CHAT_PROTOCOL_VERSION)

export const LocaleSchema = z.enum(['tr', 'en'])
export type Locale = z.infer<typeof LocaleSchema>

export const ENTITY_TYPES = [
  'product', 'variant', 'order', 'claim', 'customer', 'invoice', 'shipment',
  'integration', 'question', 'report',
  'tenant', 'platformJob', 'logEvent', // yalnız backoffice
] as const
export const EntityTypeSchema = z.enum(ENTITY_TYPES)
export type EntityType = z.infer<typeof EntityTypeSchema>

/** Uygulama içi bağlantı. screen = host'un ekran anahtarı (web: screens.ts key). params yalnız teknik kimlik/kapalı enum (PII yok). */
export const AppLinkSchema = z
  .object({
    screen: id(64),
    params: z
      .record(str(32), str(128))
      .refine((p) => Object.keys(p).length <= 8, { message: 'params ≤ 8 anahtar' })
      .optional(),
  })
  .strict()
export type AppLink = z.infer<typeof AppLinkSchema>

export const EntityRefSchema = z.object({ type: EntityTypeSchema, id: id(128), label: str(200) }).strict()
export type EntityRef = z.infer<typeof EntityRefSchema>

// ---------- İstemci → sunucu ----------

export const PageContextSchema = z
  .object({
    screen: id(64),
    entity: z.object({ type: EntityTypeSchema, id: id(128) }).strict().optional(),
    selection: z.object({ type: EntityTypeSchema, ids: z.array(id(128)).max(100) }).strict().optional(),
    filters: z
      .record(str(32), str(128))
      .refine((f) => Object.keys(f).length <= 10, { message: 'filters ≤ 10 anahtar' })
      .optional(),
  })
  .strict()
export type PageContext = z.infer<typeof PageContextSchema>

export const FormValueSchema = z.union([str(4000), z.number(), z.boolean(), z.array(str(500)).max(50), z.null()])
export type FormValue = z.infer<typeof FormValueSchema>

export const UserInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().min(1).max(4000) }).strict(),
  z
    .object({
      kind: z.literal('form'),
      formId: id(64),
      values: z.record(str(64), FormValueSchema).refine((v) => Object.keys(v).length <= 8, { message: 'values ≤ 8 alan' }),
    })
    .strict(),
])
export type UserInput = z.infer<typeof UserInputSchema>

export const TurnRequestSchema = z
  .object({
    v: V,
    conversationId: id(64).nullable(),
    clientTurnId: uuid,
    locale: LocaleSchema,
    input: UserInputSchema,
    context: PageContextSchema.optional(),
    client: z.object({ shell: z.enum(['web', 'electron']), localTools: z.array(id(64)).max(10).optional() }).strict().optional(),
  })
  .strict()
export type TurnRequest = z.infer<typeof TurnRequestSchema>

export const ConfirmRequestSchema = z
  .object({
    v: V,
    conversationId: id(64),
    pendingActionId: id(64),
    decision: z.enum(['approve', 'reject']),
    typedPhrase: str(64).optional(),
    idempotencyKey: uuid,
  })
  .strict()
export type ConfirmRequest = z.infer<typeof ConfirmRequestSchema>

export const MoreRequestSchema = z.object({ v: V, token: id(512) }).strict()
export type MoreRequest = z.infer<typeof MoreRequestSchema>

export const LlmProviderIdSchema = z.enum(['anthropic', 'openai', 'google'])
export type LlmProviderId = z.infer<typeof LlmProviderIdSchema>

export const AgentInfoSchema = z
  .object({
    v: V,
    enabled: z.boolean(),
    reason: z.enum(['DISABLED', 'SETUP_REQUIRED', 'MAINTENANCE']).optional(),
    setup: z
      .object({
        configured: z.boolean(),
        canConfigure: z.boolean(),
        consentRequired: z.boolean(),
        canConsent: z.boolean(),
        provider: LlmProviderIdSchema.optional(),
        model: str(64).optional(),
      })
      .strict(),
    readOnly: z.boolean(),
    limits: z.object({ maxInputChars: z.number().int().positive().max(4000), turnsPerMinute: z.number().int().positive() }).strict(),
    suggestions: z.array(z.object({ id: id(64), text: z.string().min(1).max(200) }).strict()).max(6),
  })
  .strict()
export type AgentInfo = z.infer<typeof AgentInfoSchema>

// ---------- BYOK kurulum DTO'ları (K37) ----------

export const ProviderErrorCodeSchema = z.enum(['LLM_KEY_INVALID', 'LLM_QUOTA', 'LLM_RATE_LIMITED', 'LLM_MODEL_UNAVAILABLE', 'LLM_UNAVAILABLE'])
export type ProviderErrorCode = z.infer<typeof ProviderErrorCodeSchema>

export const ProviderCatalogEntrySchema = z
  .object({
    id: LlmProviderIdSchema,
    label: z.string().min(1).max(40),
    models: z.array(z.object({ id: id(64), label: z.string().min(1).max(80), recommended: z.boolean().optional() }).strict()).min(1).max(20),
    keyHelpUrl: z.string().url().max(300).startsWith('https://'),
  })
  .strict()
export type ProviderCatalogEntry = z.infer<typeof ProviderCatalogEntrySchema>

export const ProviderUsageSchema = z.object({ requests: count, inputTokens: count, outputTokens: count }).strict()
export type ProviderUsage = z.infer<typeof ProviderUsageSchema>

export const ProviderStatusSchema = z
  .object({
    v: V,
    configured: z.boolean(),
    canConfigure: z.boolean(),
    consentRequired: z.boolean(),
    canConsent: z.boolean(),
    provider: LlmProviderIdSchema.optional(),
    model: str(64).optional(),
    apiKey: z.literal('sensitive').optional(),
    lastTest: z.object({ at: isoDateTime, ok: z.boolean(), code: ProviderErrorCodeSchema.optional() }).strict().optional(),
    consent: z.object({ at: isoDateTime, byRole: z.enum(['owner', 'platformAdmin']), textVersion: id(32) }).strict().optional(),
    usage: z.object({ today: ProviderUsageSchema, month: ProviderUsageSchema }).strict().optional(),
    catalog: z.array(ProviderCatalogEntrySchema).max(10),
    consentText: z.object({ version: id(32), body: z.string().min(1).max(8000) }).strict(),
  })
  .strict()
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>

export const ProviderSaveRequestSchema = z
  .object({
    v: V,
    provider: LlmProviderIdSchema,
    model: id(64),
    apiKey: z.string().min(1).max(512).optional(),
    consent: z.object({ textVersion: id(32), accepted: z.literal(true) }).strict().optional(),
  })
  .strict()
export type ProviderSaveRequest = z.infer<typeof ProviderSaveRequestSchema>

export const ProviderConsentRequestSchema = z.object({ v: V, textVersion: id(32), decision: z.enum(['accept', 'revoke']) }).strict()
export type ProviderConsentRequest = z.infer<typeof ProviderConsentRequestSchema>

export const ProviderTestRequestSchema = z
  .object({ v: V, provider: LlmProviderIdSchema, model: id(64), apiKey: z.string().min(1).max(512).optional() })
  .strict()
export type ProviderTestRequest = z.infer<typeof ProviderTestRequestSchema>

export const ProviderTestResultSchema = z
  .object({ ok: z.boolean(), code: ProviderErrorCodeSchema.optional(), message: str(300), retryAfterSec: z.number().int().nonnegative().optional() })
  .strict()
export type ProviderTestResult = z.infer<typeof ProviderTestResultSchema>

// ---------- Parçalar ----------

const partId = id(64)

export const TextPartSchema = z
  .object({ id: partId, type: z.literal('text'), format: z.enum(['plain', 'markdown']), text: str(20000), streaming: z.boolean().optional() })
  .strict()
export type TextPart = z.infer<typeof TextPartSchema>

export const COLUMN_TYPES = ['text', 'number', 'money', 'percent', 'date', 'datetime', 'status', 'channel', 'entity', 'boolean'] as const
export const ColumnTypeSchema = z.enum(COLUMN_TYPES)
export type ColumnType = z.infer<typeof ColumnTypeSchema>

const currency = z.string().regex(/^[A-Z]{3}$/)

export const TableColumnSchema = z
  .object({
    key: id(64),
    label: z.string().min(1).max(80),
    type: ColumnTypeSchema,
    currency: currency.optional(),
    statusDomain: id(32).optional(),
    align: z.enum(['start', 'end']).optional(),
    untrusted: z.boolean().optional(),
  })
  .strict()
export type TableColumn = z.infer<typeof TableColumnSchema>

export const CellValueSchema = z.union([str(2000), z.number(), z.boolean(), z.null(), EntityRefSchema])
export type CellValue = z.infer<typeof CellValueSchema>
export const TableRowSchema = z.record(str(64), CellValueSchema)
export type TableRow = z.infer<typeof TableRowSchema>

const moreToken = z.object({ token: id(512) }).strict()

export const TablePartSchema = z
  .object({
    id: partId,
    type: z.literal('table'),
    title: str(120).optional(),
    capabilityId: id(128),
    columns: z.array(TableColumnSchema).min(1).max(12),
    rowKey: id(64),
    rows: z.array(TableRowSchema).max(50),
    total: count.nullable(),
    more: moreToken.nullable(),
    openIn: AppLinkSchema.optional(),
  })
  .strict()
  .refine((t) => t.columns.some((c) => c.key === t.rowKey), { message: 'rowKey columns içinde olmalı', path: ['rowKey'] })
export type TablePart = z.infer<typeof TablePartSchema>

export const MoreResultSchema = z.object({ rows: z.array(TableRowSchema).max(50), more: moreToken.nullable(), total: count.nullable() }).strict()
export type MoreResult = z.infer<typeof MoreResultSchema>

export const KpiItemSchema = z
  .object({
    key: id(64),
    label: z.string().min(1).max(80),
    value: z.number().nullable(),
    format: z.enum(['number', 'money', 'percent']),
    currency: currency.optional(),
    delta: z.object({ value: z.number(), direction: z.enum(['up', 'down', 'flat']), good: z.boolean() }).strict().optional(),
  })
  .strict()
export type KpiItem = z.infer<typeof KpiItemSchema>

export const KpiPartSchema = z
  .object({ id: partId, type: z.literal('kpi'), title: str(120).optional(), items: z.array(KpiItemSchema).min(1).max(6), openIn: AppLinkSchema.optional() })
  .strict()
export type KpiPart = z.infer<typeof KpiPartSchema>

export const ConfirmStateSchema = z.enum(['pending', 'executing', 'done', 'rejected', 'expired', 'failed'])
export type ConfirmState = z.infer<typeof ConfirmStateSchema>

export const ConfirmPartSchema = z
  .object({
    id: partId,
    type: z.literal('confirm'),
    pendingActionId: id(64),
    capabilityId: id(128),
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(500),
    effect: z.enum(['write', 'destructive']),
    risk: z.enum(['low', 'medium', 'high']),
    external: z.boolean(),
    affected: z.object({ count, sample: z.array(EntityRefSchema).max(10) }).strict(),
    changes: z.array(z.object({ label: z.string().min(1).max(80), from: str(200).optional(), to: str(200) }).strict()).max(20).optional(),
    confirmMode: z.enum(['confirm', 'typed']),
    typedPhrase: z.string().min(1).max(64).optional(),
    expiresAt: isoDateTime,
    state: ConfirmStateSchema,
    result: z.object({ message: str(300), openIn: AppLinkSchema.optional() }).strict().optional(),
  })
  .strict()
  .refine((c) => c.confirmMode !== 'typed' || !!c.typedPhrase, { message: "typed kipte typedPhrase zorunlu", path: ['typedPhrase'] })
export type ConfirmPart = z.infer<typeof ConfirmPartSchema>

export const ProgressPartSchema = z
  .object({
    id: partId,
    type: z.literal('progress'),
    label: z.string().min(1).max(120),
    capabilityId: id(128).optional(),
    state: z.enum(['running', 'done', 'failed', 'cancelled']),
    detail: str(200).optional(),
  })
  .strict()
export type ProgressPart = z.infer<typeof ProgressPartSchema>

export const CHAT_ERROR_CODES = [
  'UNAUTHENTICATED', 'FORBIDDEN', 'PLAN_REQUIRED', 'SUBSCRIPTION_RESTRICTED',
  'RATE_LIMITED', 'QUOTA_EXCEEDED', 'LIVE_READONLY', 'MAINTENANCE', 'IMPERSONATION_FORBIDDEN',
  'CAPABILITY_DISABLED', 'VALIDATION', 'CONFLICT', 'UNAVAILABLE', 'TIMEOUT',
  'CONFIRM_EXPIRED', 'TURN_IN_PROGRESS', 'TURN_DUPLICATE',
  'LLM_KEY_INVALID', 'LLM_QUOTA', 'LLM_RATE_LIMITED', 'LLM_MODEL_UNAVAILABLE', 'LLM_UNAVAILABLE', 'SETUP_REQUIRED',
  'STREAM_INTERRUPTED', 'PROTOCOL', 'OFFLINE', 'INTERNAL',
] as const
export const ChatErrorCodeSchema = z.enum(CHAT_ERROR_CODES)
export type ChatErrorCode = z.infer<typeof ChatErrorCodeSchema>
// LLM_KEY_INVALID / LLM_MODEL_UNAVAILABLE / SETUP_REQUIRED → action { kind:'setup' } (kurulumu aç); LLM_QUOTA → sağlayıcı hesabını kontrol et metni

export const ErrorActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('retry') }).strict(),
  z.object({ kind: z.literal('open'), link: AppLinkSchema, label: z.string().min(1).max(80) }).strict(),
  z.object({ kind: z.literal('setup') }).strict(),
])

const errorFields = {
  code: ChatErrorCodeSchema,
  message: z.string().min(1).max(300),
  supportCode: id(64).optional(),
  retryable: z.boolean(),
  action: ErrorActionSchema.optional(),
}

export const ErrorPartSchema = z.object({ id: partId, type: z.literal('error'), ...errorFields }).strict()
export type ErrorPart = z.infer<typeof ErrorPartSchema>
export const TurnErrorSchema = z.object(errorFields).strict()
export type TurnError = z.infer<typeof TurnErrorSchema>

export const EntityLinkPartSchema = z
  .object({
    id: partId,
    type: z.literal('entity-link'),
    entity: EntityRefSchema,
    link: AppLinkSchema,
    description: str(300).optional(),
    fields: z
      .array(
        z
          .object({
            label: z.string().min(1).max(80),
            value: str(200),
            type: z.enum(['text', 'money', 'date', 'status']).optional(),
            statusDomain: id(32).optional(),
          })
          .strict(),
      )
      .max(8)
      .optional(),
  })
  .strict()
export type EntityLinkPart = z.infer<typeof EntityLinkPartSchema>

const fieldBase = { name: id(64), label: z.string().min(1).max(80), required: z.boolean(), help: str(200).optional() }

export const FormFieldSchema = z.discriminatedUnion('kind', [
  z.object({ ...fieldBase, kind: z.literal('text'), maxLength: z.number().int().positive().max(500), multiline: z.boolean().optional() }).strict(),
  z.object({ ...fieldBase, kind: z.literal('number'), min: z.number().optional(), max: z.number().optional(), step: z.number().positive().optional() }).strict(),
  z.object({ ...fieldBase, kind: z.literal('money'), currency, min: z.number().optional() }).strict(),
  z
    .object({
      ...fieldBase,
      kind: z.literal('select'),
      options: z.array(z.object({ value: id(128), label: z.string().min(1).max(120) }).strict()).min(1).max(50),
      multiple: z.boolean().optional(),
    })
    .strict(),
  z.object({ ...fieldBase, kind: z.literal('date') }).strict(),
  z.object({ ...fieldBase, kind: z.literal('boolean') }).strict(),
  z.object({ ...fieldBase, kind: z.literal('entity'), entityType: EntityTypeSchema, multiple: z.boolean().optional() }).strict(),
]) // 'password' / sır alanı YOKTUR (ADR-0019 §4.2 credential)
export type FormField = z.infer<typeof FormFieldSchema>

export const FormPartSchema = z
  .object({
    id: partId,
    type: z.literal('form'),
    formId: id(64),
    capabilityId: id(128),
    title: z.string().min(1).max(120),
    fields: z.array(FormFieldSchema).min(1).max(8),
    submitLabel: z.string().min(1).max(40),
    state: z.enum(['open', 'submitted', 'cancelled', 'expired']),
    expiresAt: isoDateTime,
  })
  .strict()
export type FormPart = z.infer<typeof FormPartSchema>

export const PART_TYPES = ['text', 'table', 'kpi', 'confirm', 'progress', 'error', 'entity-link', 'form'] as const
export type PartType = (typeof PART_TYPES)[number]

/** Bilinen parçalar. `refine`li şemalar discriminatedUnion'a giremediği için tür alanına göre elle yönlendirilir. */
const KNOWN_PART_SCHEMAS = {
  text: TextPartSchema,
  table: TablePartSchema,
  kpi: KpiPartSchema,
  confirm: ConfirmPartSchema,
  progress: ProgressPartSchema,
  error: ErrorPartSchema,
  'entity-link': EntityLinkPartSchema,
  form: FormPartSchema,
} as const

export type Part = TextPart | TablePart | KpiPart | ConfirmPart | ProgressPart | ErrorPart | EntityLinkPart | FormPart
// 'chart' AYRILMIŞ (v1'de yok). İstemci bilinmeyen `type`'ı PartUnknown ile çizer (ileri uyum).

/** İleri uyum: bilinmeyen `type` (ör. 'chart'). Yalnız `id` + `type` okunur; içerik ÇİZİLMEZ. */
export const UnknownPartSchema = z
  .object({ id: partId, type: z.string().min(1).max(64) })
  .passthrough()
  .refine((p) => !(PART_TYPES as readonly string[]).includes(p.type), { message: 'bilinen tür kendi şemasına uymalı' })
export type UnknownPart = { id: string; type: string; [key: string]: unknown }

/** Bilinen tür → kendi (strict) şeması; bilinmeyen tür → UnknownPart. Bilinen türün bozuk hâli REDDEDİLİR. */
export const PartSchema: z.ZodType<Part | UnknownPart> = z.custom<Part | UnknownPart>().superRefine((value, ctx) => {
  const type = value && typeof value === 'object' ? (value as { type?: unknown }).type : undefined
  const schema = typeof type === 'string' ? (KNOWN_PART_SCHEMAS as Record<string, z.ZodTypeAny>)[type] : undefined
  const result = (schema ?? UnknownPartSchema).safeParse(value)
  if (!result.success) for (const issue of result.error.issues) ctx.addIssue(issue)
})

export function isKnownPart(part: Part | UnknownPart): part is Part {
  return (PART_TYPES as readonly string[]).includes(part.type)
}

// ---------- Sunucu → istemci olayları ----------

export const TurnEndStatusSchema = z.enum(['completed', 'awaiting-confirm', 'awaiting-input', 'cancelled', 'failed'])
export type TurnEndStatus = z.infer<typeof TurnEndStatusSchema>

export const ServerEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('turn.start'), turnId: id(64), conversationId: id(64), messageId: id(64) }).strict(),
  z.object({ type: z.literal('part'), messageId: id(64), part: PartSchema }).strict(), // id'ye göre ekle/değiştir (upsert)
  z.object({ type: z.literal('delta'), messageId: id(64), partId, text: z.string().min(1).max(2000) }).strict(), // yalnız text parçasına ek
  z.object({ type: z.literal('turn.end'), turnId: id(64), status: TurnEndStatusSchema }).strict(),
  z.object({ type: z.literal('error'), error: TurnErrorSchema }).strict(), // tur düzeyi hata; ardından akış kapanır
])
export type ServerEvent = z.infer<typeof ServerEventSchema>

// ---------- İstemci tarafı mesaj modeli (protokol değil; useChat durumu) ----------

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'notice' // notice: "Yeni sohbet başladı", "Bağlam: Sipariş #…"
  createdAt: string
  parts: Array<Part | UnknownPart>
  status: 'streaming' | 'complete' | 'cancelled' | 'error'
}
