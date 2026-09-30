/**
 * chat/v1 protokolu (ADR-0034 Karar 3; docs/cloud-contracts/CHAT_UI_CONTRACT.md §4) -- zod karsiligi.
 * KANONIK dosya ileride frontend/packages/chat/src/protocol/v1.ts olacak; bu dosya onun BIREBIR kopyasidir (ilk yorum blogu haric).
 * Elle DEGISTIRILMEZ: degisiklik onyuzde yapilir, `node scripts/sync-chat-protocol.cjs` ile kopyalanir
 * (tests/static/chatProtocol.static.test.ts iki dosyanin esitligini dogrular). Yalniz 'zod' ice aktarilir.
 */
import { z } from 'zod'

export const CHAT_PROTOCOL_VERSION = 1 as const

// ---------- Ortak ----------
export const LocaleSchema = z.enum(['tr', 'en'])
export type Locale = z.infer<typeof LocaleSchema>

export const EntityTypeSchema = z.enum([
  'product', 'variant', 'order', 'claim', 'customer', 'invoice', 'shipment',
  'integration', 'question', 'report',
  'tenant', 'platformJob', 'logEvent', // yalniz backoffice
])
export type EntityType = z.infer<typeof EntityTypeSchema>

/** Uygulama ici baglanti. screen = host'un ekran anahtari. params yalniz teknik kimlik/kapali enum (PII yok). */
export const AppLinkSchema = z.object({
  screen: z.string().min(1).max(64),
  params: z.record(z.string().min(1).max(32), z.string().max(128))
    .refine((o) => Object.keys(o).length <= 8, { message: 'params en fazla 8 anahtar' })
    .optional(),
}).strict()
export type AppLink = z.infer<typeof AppLinkSchema>

export const EntityRefSchema = z.object({
  type: EntityTypeSchema,
  id: z.string().min(1).max(128),
  label: z.string().max(200),
}).strict()
export type EntityRef = z.infer<typeof EntityRefSchema>

// ---------- Istemci -> sunucu ----------
export const PageContextSchema = z.object({
  screen: z.string().min(1).max(64),
  entity: z.object({ type: EntityTypeSchema, id: z.string().min(1).max(128) }).strict().optional(),
  selection: z.object({ type: EntityTypeSchema, ids: z.array(z.string().min(1).max(128)).max(100) }).strict().optional(),
  filters: z.record(z.string().min(1).max(32), z.string().max(128))
    .refine((o) => Object.keys(o).length <= 10, { message: 'filters en fazla 10 anahtar' })
    .optional(),
}).strict()
export type PageContext = z.infer<typeof PageContextSchema>

export const FormValueSchema = z.union([
  z.string().max(2000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(200)).max(50),
  z.null(),
])
export type FormValue = z.infer<typeof FormValueSchema>

export const UserInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().min(1).max(4000) }).strict(),
  z.object({
    kind: z.literal('form'),
    formId: z.string().min(1).max(64),
    values: z.record(z.string().min(1).max(64), FormValueSchema)
      .refine((o) => Object.keys(o).length <= 20, { message: 'values en fazla 20 anahtar' }),
  }).strict(),
])
export type UserInput = z.infer<typeof UserInputSchema>

export const TurnRequestSchema = z.object({
  v: z.literal(1),
  conversationId: z.string().min(1).max(64).nullable(),
  clientTurnId: z.string().uuid(),
  locale: LocaleSchema,
  input: UserInputSchema,
  context: PageContextSchema.optional(),
  client: z.object({
    shell: z.enum(['web', 'electron']),
    localTools: z.array(z.string().min(1).max(64)).max(10).optional(),
  }).strict().optional(),
}).strict()
export type TurnRequest = z.infer<typeof TurnRequestSchema>

export const ConfirmRequestSchema = z.object({
  v: z.literal(1),
  conversationId: z.string().min(1).max(64),
  pendingActionId: z.string().min(1).max(64),
  decision: z.enum(['approve', 'reject']),
  typedPhrase: z.string().max(200).optional(),
  idempotencyKey: z.string().uuid(),
}).strict()
export type ConfirmRequest = z.infer<typeof ConfirmRequestSchema>

export const MoreRequestSchema = z.object({ v: z.literal(1), token: z.string().min(1).max(512) }).strict()
export type MoreRequest = z.infer<typeof MoreRequestSchema>

// ---------- BYOK kurulum DTO'lari (K37) ----------
export const LlmProviderIdSchema = z.enum(['anthropic', 'openai', 'google'])
export type LlmProviderId = z.infer<typeof LlmProviderIdSchema>

export const ProviderErrorCodeSchema = z.enum(['LLM_KEY_INVALID', 'LLM_QUOTA', 'LLM_RATE_LIMITED', 'LLM_MODEL_UNAVAILABLE', 'LLM_UNAVAILABLE'])
export type ProviderErrorCode = z.infer<typeof ProviderErrorCodeSchema>

export const ProviderCatalogEntrySchema = z.object({
  id: LlmProviderIdSchema,
  label: z.string().min(1).max(80),
  models: z.array(z.object({
    id: z.string().min(1).max(128),
    label: z.string().min(1).max(128),
    recommended: z.boolean().optional(),
  }).strict()).max(10),
  keyHelpUrl: z.string().url().max(300),
}).strict()
export type ProviderCatalogEntry = z.infer<typeof ProviderCatalogEntrySchema>

export const ProviderUsageSchema = z.object({
  requests: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
}).strict()
export type ProviderUsage = z.infer<typeof ProviderUsageSchema>

export const ProviderStatusSchema = z.object({
  v: z.literal(1),
  configured: z.boolean(),
  canConfigure: z.boolean(),
  consentRequired: z.boolean(),
  canConsent: z.boolean(),
  provider: LlmProviderIdSchema.optional(),
  model: z.string().min(1).max(128).optional(),
  apiKey: z.literal('sensitive').optional(),
  lastTest: z.object({
    at: z.string().max(40),
    ok: z.boolean(),
    code: ProviderErrorCodeSchema.optional(),
  }).strict().optional(),
  consent: z.object({
    at: z.string().max(40),
    byRole: z.enum(['owner', 'platformAdmin']),
    textVersion: z.string().min(1).max(32),
  }).strict().optional(),
  usage: z.object({ today: ProviderUsageSchema, month: ProviderUsageSchema }).strict().optional(),
  catalog: z.array(ProviderCatalogEntrySchema).max(10),
  consentText: z.object({ version: z.string().min(1).max(32), body: z.string().max(5000) }).strict(),
}).strict()
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>

export const ProviderSaveRequestSchema = z.object({
  v: z.literal(1),
  provider: LlmProviderIdSchema,
  model: z.string().min(1).max(128),
  apiKey: z.string().min(1).max(512).optional(),
  consent: z.object({ textVersion: z.string().min(1).max(32), accepted: z.literal(true) }).strict().optional(),
}).strict()
export type ProviderSaveRequest = z.infer<typeof ProviderSaveRequestSchema>

export const ProviderConsentRequestSchema = z.object({
  v: z.literal(1),
  textVersion: z.string().min(1).max(32),
  decision: z.enum(['accept', 'revoke']),
}).strict()
export type ProviderConsentRequest = z.infer<typeof ProviderConsentRequestSchema>

export const ProviderTestRequestSchema = z.object({
  v: z.literal(1),
  provider: LlmProviderIdSchema,
  model: z.string().min(1).max(128),
  apiKey: z.string().min(1).max(512).optional(),
}).strict()
export type ProviderTestRequest = z.infer<typeof ProviderTestRequestSchema>

export const ProviderTestResultSchema = z.object({
  ok: z.boolean(),
  code: ProviderErrorCodeSchema.optional(),
  message: z.string().max(300),
  retryAfterSec: z.number().int().nonnegative().optional(),
}).strict()
export type ProviderTestResult = z.infer<typeof ProviderTestResultSchema>

export const AgentInfoSchema = z.object({
  v: z.literal(1),
  enabled: z.boolean(),
  reason: z.enum(['DISABLED', 'SETUP_REQUIRED', 'MAINTENANCE']).optional(),
  setup: z.object({
    configured: z.boolean(),
    canConfigure: z.boolean(),
    consentRequired: z.boolean(),
    canConsent: z.boolean(),
    provider: LlmProviderIdSchema.optional(),
    model: z.string().min(1).max(128).optional(),
  }).strict(),
  readOnly: z.boolean(),
  limits: z.object({ maxInputChars: z.number().int().positive(), turnsPerMinute: z.number().int().positive() }).strict(),
  suggestions: z.array(z.object({ id: z.string().min(1).max(64), text: z.string().min(1).max(200) }).strict()).max(6),
}).strict()
export type AgentInfo = z.infer<typeof AgentInfoSchema>

// ---------- Parcalar ----------
const partId = z.string().min(1).max(64)

export const TextPartSchema = z.object({
  id: partId,
  type: z.literal('text'),
  format: z.enum(['plain', 'markdown']),
  text: z.string().max(20000),
  streaming: z.boolean().optional(),
}).strict()
export type TextPart = z.infer<typeof TextPartSchema>

export const ColumnTypeSchema = z.enum(['text', 'number', 'money', 'percent', 'date', 'datetime', 'status', 'channel', 'entity', 'boolean'])
export type ColumnType = z.infer<typeof ColumnTypeSchema>

export const TableColumnSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().max(80),
  type: ColumnTypeSchema,
  currency: z.string().length(3).optional(),
  statusDomain: z.string().min(1).max(32).optional(),
  align: z.enum(['start', 'end']).optional(),
  untrusted: z.boolean().optional(),
}).strict()
export type TableColumn = z.infer<typeof TableColumnSchema>

export const CellValueSchema = z.union([z.string().max(500), z.number(), z.boolean(), z.null(), EntityRefSchema])
export type CellValue = z.infer<typeof CellValueSchema>
export const TableRowSchema = z.record(z.string().min(1).max(64), CellValueSchema)
export type TableRow = z.infer<typeof TableRowSchema>

export const MoreResultSchema = z.object({
  rows: z.array(TableRowSchema).max(50),
  more: z.object({ token: z.string().min(1).max(512) }).strict().nullable(),
  total: z.number().int().nonnegative().nullable(),
}).strict()
export type MoreResult = z.infer<typeof MoreResultSchema>

export const TablePartSchema = z.object({
  id: partId,
  type: z.literal('table'),
  title: z.string().max(120).optional(),
  capabilityId: z.string().min(1).max(96),
  columns: z.array(TableColumnSchema).min(1).max(12),
  rowKey: z.string().min(1).max(64),
  rows: z.array(TableRowSchema).max(50),
  total: z.number().int().nonnegative().nullable(),
  more: z.object({ token: z.string().min(1).max(512) }).strict().nullable(),
  openIn: AppLinkSchema.optional(),
}).strict()
export type TablePart = z.infer<typeof TablePartSchema>

export const KpiItemSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().max(80),
  value: z.number().nullable(),
  format: z.enum(['number', 'money', 'percent']),
  currency: z.string().length(3).optional(),
  delta: z.object({
    value: z.number(),
    direction: z.enum(['up', 'down', 'flat']),
    good: z.boolean(),
  }).strict().optional(),
}).strict()
export type KpiItem = z.infer<typeof KpiItemSchema>

export const KpiPartSchema = z.object({
  id: partId,
  type: z.literal('kpi'),
  title: z.string().max(120).optional(),
  items: z.array(KpiItemSchema).min(1).max(6),
  openIn: AppLinkSchema.optional(),
}).strict()
export type KpiPart = z.infer<typeof KpiPartSchema>

export const ConfirmPartSchema = z.object({
  id: partId,
  type: z.literal('confirm'),
  pendingActionId: z.string().min(1).max(64),
  capabilityId: z.string().min(1).max(96),
  title: z.string().max(120),
  summary: z.string().max(500),
  effect: z.enum(['write', 'destructive']),
  risk: z.enum(['low', 'medium', 'high']),
  external: z.boolean(),
  affected: z.object({ count: z.number().int().nonnegative(), sample: z.array(EntityRefSchema).max(10) }).strict(),
  changes: z.array(z.object({
    label: z.string().max(80),
    from: z.string().max(200).optional(),
    to: z.string().max(200),
  }).strict()).max(20).optional(),
  confirmMode: z.enum(['confirm', 'typed']),
  typedPhrase: z.string().max(200).optional(),
  expiresAt: z.string().max(40),
  state: z.enum(['pending', 'executing', 'done', 'rejected', 'expired', 'failed']),
  result: z.object({ message: z.string().max(500), openIn: AppLinkSchema.optional() }).strict().optional(),
}).strict()
export type ConfirmPart = z.infer<typeof ConfirmPartSchema>

export const ProgressPartSchema = z.object({
  id: partId,
  type: z.literal('progress'),
  label: z.string().max(120),
  capabilityId: z.string().min(1).max(96).optional(),
  state: z.enum(['running', 'done', 'failed', 'cancelled']),
  detail: z.string().max(200).optional(),
}).strict()
export type ProgressPart = z.infer<typeof ProgressPartSchema>

export const ChatErrorCodeSchema = z.enum([
  'UNAUTHENTICATED', 'FORBIDDEN', 'PLAN_REQUIRED', 'SUBSCRIPTION_RESTRICTED',
  'RATE_LIMITED', 'QUOTA_EXCEEDED', 'LIVE_READONLY', 'MAINTENANCE', 'IMPERSONATION_FORBIDDEN',
  'CAPABILITY_DISABLED', 'VALIDATION', 'CONFLICT', 'UNAVAILABLE', 'TIMEOUT',
  'CONFIRM_EXPIRED', 'TURN_IN_PROGRESS', 'TURN_DUPLICATE',
  'LLM_KEY_INVALID', 'LLM_QUOTA', 'LLM_RATE_LIMITED', 'LLM_MODEL_UNAVAILABLE', 'LLM_UNAVAILABLE', 'SETUP_REQUIRED',
  'STREAM_INTERRUPTED', 'PROTOCOL', 'OFFLINE', 'INTERNAL',
])
export type ChatErrorCode = z.infer<typeof ChatErrorCodeSchema>

export const ErrorPartSchema = z.object({
  id: partId,
  type: z.literal('error'),
  code: ChatErrorCodeSchema,
  message: z.string().max(300),
  supportCode: z.string().min(1).max(64).optional(),
  retryable: z.boolean(),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('retry') }).strict(),
    z.object({ kind: z.literal('open'), link: AppLinkSchema, label: z.string().max(80) }).strict(),
    z.object({ kind: z.literal('setup') }).strict(),
  ]).optional(),
}).strict()
export type ErrorPart = z.infer<typeof ErrorPartSchema>

export const EntityLinkPartSchema = z.object({
  id: partId,
  type: z.literal('entity-link'),
  entity: EntityRefSchema,
  link: AppLinkSchema,
  description: z.string().max(300).optional(),
  fields: z.array(z.object({
    label: z.string().max(80),
    value: z.string().max(200),
    type: z.enum(['text', 'money', 'date', 'status']).optional(),
    statusDomain: z.string().min(1).max(32).optional(),
  }).strict()).max(8).optional(),
}).strict()
export type EntityLinkPart = z.infer<typeof EntityLinkPartSchema>

const formFieldBase = {
  name: z.string().min(1).max(64),
  label: z.string().max(120),
  required: z.boolean(),
  help: z.string().max(300).optional(),
}
// 'password' / sir alani YOKTUR (ADR-0019 §4.2 credential)
export const FormFieldSchema = z.discriminatedUnion('kind', [
  z.object({ ...formFieldBase, kind: z.literal('text'), maxLength: z.number().int().positive().max(500), multiline: z.boolean().optional() }).strict(),
  z.object({ ...formFieldBase, kind: z.literal('number'), min: z.number().optional(), max: z.number().optional(), step: z.number().optional() }).strict(),
  z.object({ ...formFieldBase, kind: z.literal('money'), currency: z.string().length(3), min: z.number().optional() }).strict(),
  z.object({
    ...formFieldBase, kind: z.literal('select'),
    options: z.array(z.object({ value: z.string().max(128), label: z.string().max(120) }).strict()).max(50),
    multiple: z.boolean().optional(),
  }).strict(),
  z.object({ ...formFieldBase, kind: z.literal('date') }).strict(),
  z.object({ ...formFieldBase, kind: z.literal('boolean') }).strict(),
  z.object({ ...formFieldBase, kind: z.literal('entity'), entityType: EntityTypeSchema, multiple: z.boolean().optional() }).strict(), // v1: kimlik metin girisi; secici sonra
])
export type FormField = z.infer<typeof FormFieldSchema>

export const FormPartSchema = z.object({
  id: partId,
  type: z.literal('form'),
  formId: z.string().min(1).max(64),
  capabilityId: z.string().min(1).max(96),
  title: z.string().max(120),
  fields: z.array(FormFieldSchema).min(1).max(8),
  submitLabel: z.string().max(80),
  state: z.enum(['open', 'submitted', 'cancelled', 'expired']),
  expiresAt: z.string().max(40),
}).strict()
export type FormPart = z.infer<typeof FormPartSchema>

const KNOWN_PART_TYPES = ['text', 'table', 'kpi', 'confirm', 'progress', 'error', 'entity-link', 'form'] as const

const KnownPartSchema = z.discriminatedUnion('type', [
  TextPartSchema, TablePartSchema, KpiPartSchema, ConfirmPartSchema, ProgressPartSchema, ErrorPartSchema, EntityLinkPartSchema, FormPartSchema,
])
/** Ileri uyum: bilinmeyen `type` ('chart' ayrilmis, v1'de yok) istemcide PartUnknown ile cizilir. Bilinen tur bozuksa BURAYA DUSMEZ. */
const UnknownPartSchema = z.object({
  id: partId,
  type: z.string().min(1).max(64).refine((t) => !(KNOWN_PART_TYPES as readonly string[]).includes(t), { message: 'bilinen parca turu bozuk' }),
}).passthrough()

export const PartSchema = z.union([KnownPartSchema, UnknownPartSchema])
export type Part = TextPart | TablePart | KpiPart | ConfirmPart | ProgressPart | ErrorPart | EntityLinkPart | FormPart

// ---------- Sunucu -> istemci olaylari ----------
export const ServerEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('turn.start'),
    turnId: z.string().min(1).max(64), conversationId: z.string().min(1).max(64), messageId: z.string().min(1).max(64),
  }).strict(),
  z.object({ type: z.literal('part'), messageId: z.string().min(1).max(64), part: PartSchema }).strict(), // id'ye gore ekle/degistir (upsert)
  z.object({
    type: z.literal('delta'),
    messageId: z.string().min(1).max(64), partId, text: z.string().max(2000),
  }).strict(), // yalniz text parcasina ek
  z.object({
    type: z.literal('turn.end'),
    turnId: z.string().min(1).max(64),
    status: z.enum(['completed', 'awaiting-confirm', 'awaiting-input', 'cancelled', 'failed']),
  }).strict(),
  z.object({ type: z.literal('error'), error: ErrorPartSchema.omit({ id: true, type: true }) }).strict(), // tur duzeyi hata; ardindan akis kapanir
])
export type ServerEvent =
  | { type: 'turn.start'; turnId: string; conversationId: string; messageId: string }
  | { type: 'part'; messageId: string; part: Part }
  | { type: 'delta'; messageId: string; partId: string; text: string }
  | { type: 'turn.end'; turnId: string; status: 'completed' | 'awaiting-confirm' | 'awaiting-input' | 'cancelled' | 'failed' }
  | { type: 'error'; error: Omit<ErrorPart, 'id' | 'type'> }

// ---------- Istemci tarafi mesaj modeli (protokol degil; useChat durumu) ----------
export const ChatMessageSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(['user', 'assistant', 'notice']),
  createdAt: z.string().max(40),
  parts: z.array(PartSchema),
  status: z.enum(['streaming', 'complete', 'cancelled', 'error']),
}).strict()
export type ChatMessage = z.infer<typeof ChatMessageSchema>
