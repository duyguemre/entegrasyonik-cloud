/**
 * frontend/src/components/layout/shellNotice.ts
 *
 * FE-CFG-2 — platform duyurusu ve bakım şeridinin sunum modeli (saf; vitest). Ton = anlam (DESIGN_SYSTEM §2.3):
 * duyuru info → `info`, warning → `warning`, critical → `error`; bakım her zaman `warning`. Renk tek başına anlam
 * taşımaz: her şeritte ikon + başlık vardır.
 */
import type { AnnouncementLevel } from '@/stores/publicConfig'

export type ShellNoticeTone = 'info' | 'warning' | 'error'

export interface ShellNoticeModel {
  kind: 'announcement' | 'maintenance'
  tone: ShellNoticeTone
  icon: string
  title: string
  text: string
  dismissible: boolean
}

export const MAINTENANCE_FALLBACK_TEXT = 'Planlı bakım çalışması sürüyor. Bazı işlemler gecikebilir; verileriniz güvende.'

const ANNOUNCEMENT: Record<AnnouncementLevel, Pick<ShellNoticeModel, 'tone' | 'icon' | 'title'>> = {
  info: { tone: 'info', icon: 'mdi-bullhorn-outline', title: 'Duyuru' },
  warning: { tone: 'warning', icon: 'mdi-alert-outline', title: 'Önemli duyuru' },
  critical: { tone: 'error', icon: 'mdi-alert-octagon-outline', title: 'Kritik duyuru' },
}

export function announcementNotice(level: AnnouncementLevel, text: string): ShellNoticeModel {
  const look = ANNOUNCEMENT[level] ?? ANNOUNCEMENT.info
  return { kind: 'announcement', ...look, text, dismissible: true }
}

export function maintenanceNotice(message: string): ShellNoticeModel {
  return {
    kind: 'maintenance',
    tone: 'warning',
    icon: 'mdi-wrench-outline',
    title: 'Bakım çalışması',
    text: message || MAINTENANCE_FALLBACK_TEXT,
    dismissible: false,
  }
}
