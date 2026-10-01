/**
 * Mesaj listesi indirgeyicisi — SAF (girdi dizisini değiştirmez, yeni dizi döndürür). Olay sırası kuralları §4.1:
 *  - `part` → mesajda `id`'ye göre upsert (mesaj yoksa — `confirm` akışında olduğu gibi — kartın mesajında aranır),
 *  - `delta` → yalnız daha önce açılmış `text` parçasına ek; bilinmeyen `partId` YOK SAYILIR (`ignored: true`),
 *  - `turn.end`'de `streaming` bayrakları düşer.
 */
import type { ChatMessage, ErrorPart, Part, TextPart, TurnError, UnknownPart, UserInput } from '../protocol/v1'

export type AnyPart = Part | UnknownPart

export const MAX_TEXT = 20000

export function nowIso(now: number = Date.now()): string {
  return new Date(now).toISOString()
}

export function userMessage(id: string, input: UserInput, createdAt: string, formSummary?: string): ChatMessage {
  const text = input.kind === 'text' ? input.text : formSummary ?? ''
  return { id, role: 'user', createdAt, status: 'complete', parts: [{ id: `${id}-t`, type: 'text', format: 'plain', text }] }
}

export function noticeMessage(id: string, text: string, createdAt: string): ChatMessage {
  return { id, role: 'notice', createdAt, status: 'complete', parts: [{ id: `${id}-t`, type: 'text', format: 'plain', text }] }
}

export function ensureReplyMessage(messages: ChatMessage[], messageId: string, createdAt: string): ChatMessage[] {
  if (messages.some((m) => m.id === messageId)) return messages
  return [...messages, { id: messageId, role: 'assistant', createdAt, status: 'streaming', parts: [] }]
}

function replaceMessage(messages: ChatMessage[], id: string, fn: (m: ChatMessage) => ChatMessage): ChatMessage[] {
  let changed = false
  const next = messages.map((m) => {
    if (m.id !== id) return m
    changed = true
    return fn(m)
  })
  return changed ? next : messages
}

export function upsertPart(messages: ChatMessage[], messageId: string, part: AnyPart, createdAt: string): ChatMessage[] {
  const base = ensureReplyMessage(messages, messageId, createdAt)
  return replaceMessage(base, messageId, (m) => {
    const index = m.parts.findIndex((p) => p.id === part.id)
    const parts = index === -1 ? [...m.parts, part] : m.parts.map((p, i) => (i === index ? part : p))
    return { ...m, parts }
  })
}

export function appendDelta(messages: ChatMessage[], messageId: string, partId: string, text: string): { messages: ChatMessage[]; ignored: boolean } {
  const message = messages.find((m) => m.id === messageId)
  const target = message?.parts.find((p) => p.id === partId)
  if (!message || !target || target.type !== 'text') return { messages, ignored: true }
  const next = replaceMessage(messages, messageId, (m) => ({
    ...m,
    parts: m.parts.map((p) => {
      if (p.id !== partId) return p
      const t = p as TextPart
      return { ...t, text: (t.text + text).slice(0, MAX_TEXT), streaming: true }
    }),
  }))
  return { messages: next, ignored: false }
}

/** Tur sonu: mesaj durumu + `streaming` bayrakları düşer; koşan ilerleme parçaları iptal/başarısız sayılır. */
export function finishMessage(messages: ChatMessage[], messageId: string | null, status: ChatMessage['status']): ChatMessage[] {
  if (!messageId) return messages
  return replaceMessage(messages, messageId, (m) => ({
    ...m,
    status,
    parts: m.parts.map((p) => {
      if (p.type === 'text' && (p as TextPart).streaming) return { ...(p as TextPart), streaming: false }
      if (p.type === 'progress' && (p as Part & { type: 'progress' }).state === 'running' && status !== 'complete') {
        return { ...(p as Part & { type: 'progress' }), state: status === 'cancelled' ? 'cancelled' : 'failed' }
      }
      return p
    }),
  }))
}

/** Tur hatası → hata parçası (mesaj yoksa — ör. HTTP 429, `turn.start` gelmeden — yeni yanıt mesajı açılır). */
export function addErrorPart(messages: ChatMessage[], messageId: string, error: TurnError, createdAt: string, partId: string): ChatMessage[] {
  const part: ErrorPart = { id: partId, type: 'error', ...error }
  return finishMessage(upsertPart(messages, messageId, part, createdAt), messageId, 'error')
}

/** Yeni metin gönderilince açık formlar `cancelled` olur (§4.1). */
export function cancelOpenForms(messages: ChatMessage[]): ChatMessage[] {
  let any = false
  const next = messages.map((m) => {
    if (!m.parts.some((p) => p.type === 'form' && (p as Part & { type: 'form' }).state === 'open')) return m
    any = true
    return { ...m, parts: m.parts.map((p) => (p.type === 'form' && (p as Part & { type: 'form' }).state === 'open' ? { ...(p as Part & { type: 'form' }), state: 'cancelled' as const } : p)) }
  })
  return any ? next : messages
}

export function setFormState(messages: ChatMessage[], formId: string, state: 'submitted' | 'expired'): ChatMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) => (p.type === 'form' && (p as Part & { type: 'form' }).formId === formId && (p as Part & { type: 'form' }).state === 'open' ? { ...(p as Part & { type: 'form' }), state } : p)),
  }))
}

/** Onay kartını (pendingActionId) istemci tarafında günceller (ör. `executing` iyimser, `expired` saat). */
export function setConfirmState(messages: ChatMessage[], pendingActionId: string, state: 'executing' | 'expired'): ChatMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) =>
      p.type === 'confirm' && (p as Part & { type: 'confirm' }).pendingActionId === pendingActionId ? { ...(p as Part & { type: 'confirm' }), state } : p,
    ),
  }))
}

export function findPendingConfirm(messages: ChatMessage[]): (Part & { type: 'confirm' }) | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const found = messages[i].parts.find((p) => p.type === 'confirm' && (p as Part & { type: 'confirm' }).state === 'pending')
    if (found) return found as Part & { type: 'confirm' }
  }
  return undefined
}

/** Tablo "daha fazla": satırları ekler, belirteci günceller (toplam gösterim ≤ 500). */
export const TABLE_ROW_CAP = 500

/** Canlı bölge özeti: "tablo, 25 satır" vb. (anahtar + sayı; metin çevirmende). */
export function summarizeParts(parts: AnyPart[]): Array<{ key: 'text' | 'table' | 'kpi' | 'confirm' | 'form' | 'entity' | 'error'; count?: number }> {
  const out: Array<{ key: 'text' | 'table' | 'kpi' | 'confirm' | 'form' | 'entity' | 'error'; count?: number }> = []
  for (const p of parts) {
    if (p.type === 'table') out.push({ key: 'table', count: (p as Part & { type: 'table' }).rows.length })
    else if (p.type === 'kpi') out.push({ key: 'kpi', count: (p as Part & { type: 'kpi' }).items.length })
    else if (p.type === 'confirm') out.push({ key: 'confirm' })
    else if (p.type === 'form') out.push({ key: 'form' })
    else if (p.type === 'entity-link') out.push({ key: 'entity' })
    else if (p.type === 'error') out.push({ key: 'error' })
    else if (p.type === 'text' && !out.some((o) => o.key === 'text')) out.push({ key: 'text' })
  }
  return out
}
