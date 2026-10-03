/**
 * [DB-02 / DBR-06] Liste uçları için sıralama alanı İZİN LİSTELERİ (ortak; Ticket hem TicketService hem AdminService'te listelenir).
 * Bilinmeyen alan => çağıranın varsayılan sıralaması (bkz. `@utils/search.pickSortField`).
 */
export const TICKET_SORT_FIELDS: readonly string[] = [
    '_id', 'ticketNumber', 'subject', 'type', 'status', 'priority', 'clientId', 'createdDate', 'updatedDate', 'lastMessageAt',
];
