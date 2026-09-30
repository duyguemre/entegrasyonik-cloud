/**
 * frontend/src/chat/placement.ts — Otopilot yerleşim sabitleri (SAF; birim testli). Karar: packages/chat/docs/PLACEMENT.md.
 */

/** ≥ 1280 px: panel içeriği iter (push); altında üstüne biner (overlay, scrim yok). < 768 px: yalnız tam sayfa. */
export const OTOPILOT_PUSH_MIN = 1280
export const OTOPILOT_WIDTH = { min: 360, max: 560, default: 400, step: 16 } as const

export function clampWidth(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return OTOPILOT_WIDTH.default
  return Math.min(OTOPILOT_WIDTH.max, Math.max(OTOPILOT_WIDTH.min, Math.round(n)))
}

export function prefsKey(scope: { userId?: string; tenantId?: string | number }): string | null {
  if (!scope.userId) return null
  return `ek:chat:${scope.userId}:${scope.tenantId ?? '-'}`
}

