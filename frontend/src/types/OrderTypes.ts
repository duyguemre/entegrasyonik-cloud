export enum OrderInternalStatusEnum {
    UNAPPROVED = 'UNAPPROVED',
    AWAITING_APPROVAL = 'AWAITING_APPROVAL',
    APPROVED = 'APPROVED',
    SHIPPED = 'SHIPPED',
    DELIVERED = 'DELIVERED',
    CANCELLED = 'CANCELLED',
    RETURNED = 'RETURNED'
}


export const ORDER_INTERNAL_STATUS_LABELS: Record<OrderInternalStatusEnum, string> = {
    [OrderInternalStatusEnum.UNAPPROVED]: 'Platform Onayı Bekliyor',
    [OrderInternalStatusEnum.AWAITING_APPROVAL]: 'Satıcı Onayı Bekliyor',
    [OrderInternalStatusEnum.APPROVED]: 'Sipariş Onaylandı',
    [OrderInternalStatusEnum.SHIPPED]: 'Teslimat Bekleniyor',
    [OrderInternalStatusEnum.DELIVERED]: 'Teslim Edildi',
    [OrderInternalStatusEnum.CANCELLED]: 'İptal Edildi',
    [OrderInternalStatusEnum.RETURNED]: 'İade Edildi'
};

// DS-v2 Aşama 3: status-map.ts ORDER_STATUS_TONE ile AYNI anlam (Vuetify rol adları; hex/dekoratif `secondary` kalktı).
export const ORDER_INTERNAL_STATUS_COLORS: Record<OrderInternalStatusEnum, string> = {
    [OrderInternalStatusEnum.UNAPPROVED]: 'warning',
    [OrderInternalStatusEnum.AWAITING_APPROVAL]: 'warning',
    [OrderInternalStatusEnum.APPROVED]: 'info',
    [OrderInternalStatusEnum.SHIPPED]: 'info',
    [OrderInternalStatusEnum.DELIVERED]: 'success',
    [OrderInternalStatusEnum.CANCELLED]: 'error',
    [OrderInternalStatusEnum.RETURNED]: 'error'
};