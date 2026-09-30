// DS-v2 Aşama 2 — eski diyalog `color` prop'unu (Vuetify tema anahtarı / Material adı)
// DS-v2 anlam tonuna çevirir. Eski çağıranlar (ConfirmationDialogComponent,
// ActionDialogComponent) API'yi değiştirmeden yeni `EkDialog` kabuğuna geçer;
// renk artık yalnızca ANLAM taşır (ikon kapsülü tonu + tehlikeli aksiyon).
import type { EkTone } from '@entegrasyonik/ui/components'

const DANGER = new Set(['danger', 'error', 'deleteButtonColor', 'red', 'red-darken-1', 'red-lighten-1'])
const TONES: Record<string, EkTone> = {
  success: 'success',
  green: 'success',
  warning: 'warning',
  orange: 'warning',
  'orange-darken-2': 'warning',
  info: 'info',
  neutral: 'neutral',
  primary: 'action',
  passiveColor: 'neutral',
  processButtonColor: 'neutral',
  grey: 'neutral',
}

export function isDangerColor(color?: string | null): boolean {
  return !!color && DANGER.has(color)
}

export function toneFromColor(color?: string | null): EkTone {
  if (!color) return 'action'
  if (isDangerColor(color)) return 'error'
  return TONES[color] ?? 'action'
}
