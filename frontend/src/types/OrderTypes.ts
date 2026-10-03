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

export const ORDER_INTERNAL_STATUS_COLORS: Record<OrderInternalStatusEnum, string> = {
    [OrderInternalStatusEnum.UNAPPROVED]: 'warning', // Beklemede (Turuncu)
    [OrderInternalStatusEnum.AWAITING_APPROVAL]: '#E65100', // Satıcı Onayı (Koyu Turuncu)
    [OrderInternalStatusEnum.APPROVED]: 'info',      // Onaylandı (Mavi)
    [OrderInternalStatusEnum.SHIPPED]: 'secondary',  // Kargolandı (Cyan/Petrol)
    [OrderInternalStatusEnum.DELIVERED]: 'success',  // Teslim Edildi (Yeşil)
    [OrderInternalStatusEnum.CANCELLED]: '#F4511E',    // İptal (Deep Orange)
    [OrderInternalStatusEnum.RETURNED]: 'error'    // İade Geldi (Red/Error)
};