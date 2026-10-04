export enum OrderInternalStatusEnum {
    UNAPPROVED = 'UNAPPROVED',
    AWAITING_APPROVAL = 'AWAITING_APPROVAL',
    APPROVED = 'APPROVED',
    SHIPPED = 'SHIPPED',
    DELIVERED = 'DELIVERED',
    CANCELLED = 'CANCELLED',
    RETURNED = 'RETURNED',
    // [eslesme-fiyat WP6-kalan, D-ORD-4] backend platform/core/orders/orderStatus.ts ile aynı
    PRE_APPROVAL = 'PRE_APPROVAL',
    SPLIT = 'SPLIT'
}


export const ORDER_INTERNAL_STATUS_LABELS: Record<OrderInternalStatusEnum, string> = {
    [OrderInternalStatusEnum.UNAPPROVED]: 'Kanal onayı bekliyor',
    [OrderInternalStatusEnum.AWAITING_APPROVAL]: 'Satıcı onayı bekliyor',
    [OrderInternalStatusEnum.APPROVED]: 'Sipariş onaylandı',
    [OrderInternalStatusEnum.SHIPPED]: 'Kargoda',
    [OrderInternalStatusEnum.DELIVERED]: 'Teslim edildi',
    [OrderInternalStatusEnum.CANCELLED]: 'İptal edildi',
    [OrderInternalStatusEnum.RETURNED]: 'İade Edildi',
    [OrderInternalStatusEnum.PRE_APPROVAL]: 'Pazaryeri ön onayı bekleniyor',
    [OrderInternalStatusEnum.SPLIT]: 'Paket bölündü'
};

// DS-v2 Aşama 3: status-map.ts ORDER_STATUS_TONE ile AYNI anlam (Vuetify rol adları; hex/dekoratif `secondary` kalktı).
export const ORDER_INTERNAL_STATUS_COLORS: Record<OrderInternalStatusEnum, string> = {
    [OrderInternalStatusEnum.UNAPPROVED]: 'warning',
    [OrderInternalStatusEnum.AWAITING_APPROVAL]: 'warning',
    [OrderInternalStatusEnum.APPROVED]: 'info',
    [OrderInternalStatusEnum.SHIPPED]: 'info',
    [OrderInternalStatusEnum.DELIVERED]: 'success',
    [OrderInternalStatusEnum.CANCELLED]: 'error',
    [OrderInternalStatusEnum.RETURNED]: 'error',
    [OrderInternalStatusEnum.PRE_APPROVAL]: 'warning',
    [OrderInternalStatusEnum.SPLIT]: 'info'
};