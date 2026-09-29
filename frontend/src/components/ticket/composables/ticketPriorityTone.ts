/**
 * frontend/src/components/ticket/composables/ticketPriorityTone.ts
 *
 * ADR-0015 B5-3 — `TicketStatusEnum` için `TICKET_STATUS_TONE` zaten `src/design/status-map.ts`'te
 * (Aşama A2, paylaşılan/A-owned dosya — bu görevin kapsamı DIŞI) tanımlı, ama `TicketPriorityEnum`
 * (öncelik) için bir eşleme YOK — önceliğin "durum" (status-map.ts'in kapsadığı anlam) olmadığı
 * ve bu dosyanın yalnızca `components/ticket/**` (B5-3 kapsamı) içinde yaşadığı için burada, YEREL
 * olarak tanımlandı (paylaşılan `status-map.ts`'e DOKUNULMADI). Değerler mevcut
 * `TICKET_PRIORITY_COLORS`'un (types/TicketTypes.ts) Vuetify tema renk adlarıyla (success/info/
 * warning/error) AYNI anlamsal sırayı izler, yalnızca `EkStatusChip`'in `StatusTone` tipine çevrilir.
 */
import { TicketPriorityEnum } from '@/types/TicketTypes'
import type { StatusTone } from '@/design/status-map'

export const TICKET_PRIORITY_TONE: Record<TicketPriorityEnum, StatusTone> = {
  [TicketPriorityEnum.LOW]: 'success',
  [TicketPriorityEnum.MEDIUM]: 'info',
  [TicketPriorityEnum.HIGH]: 'warning',
  [TicketPriorityEnum.URGENT]: 'danger',
}
