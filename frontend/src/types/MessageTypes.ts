export enum MessageStatusEnum {
    WAITING_SELLER = 'WAITING_SELLER',
    ANSWERED = 'ANSWERED',
    REJECTED = 'REJECTED',
    UNREAD = 'UNREAD',
    READ = 'READ',
    WAITING_APPROVAL = 'WAITING_APPROVAL'
}

export const MESSAGE_STATUS_LABELS: Record<MessageStatusEnum, string> = {
    [MessageStatusEnum.WAITING_SELLER]: 'Cevap Bekleniyor',
    [MessageStatusEnum.ANSWERED]: 'Cevaplandı',
    [MessageStatusEnum.REJECTED]: 'Reddedildi',
    [MessageStatusEnum.UNREAD]: 'Okunmadı',
    [MessageStatusEnum.READ]: 'Okundu',
    [MessageStatusEnum.WAITING_APPROVAL]: 'Onay Bekliyor'
};

export const MESSAGE_STATUS_COLORS: Record<MessageStatusEnum, string> = {
    [MessageStatusEnum.WAITING_SELLER]: 'warning',
    [MessageStatusEnum.ANSWERED]: 'success',
    [MessageStatusEnum.REJECTED]: 'error',
    [MessageStatusEnum.UNREAD]: 'info',
    [MessageStatusEnum.READ]: 'slate-500',
    [MessageStatusEnum.WAITING_APPROVAL]: 'indigo'
};

export enum MessageTypeEnum {
    PRODUCT_QUESTION = 'PRODUCT_QUESTION',
    ORDER_QUESTION = 'ORDER_QUESTION'
}

export const MESSAGE_TYPE_LABELS: Record<MessageTypeEnum, string> = {
    [MessageTypeEnum.PRODUCT_QUESTION]: 'Ürün Sorusu',
    [MessageTypeEnum.ORDER_QUESTION]: 'Sipariş Sorusu'
};

export const MESSAGE_TYPE_ICONS: Record<MessageTypeEnum, string> = {
    [MessageTypeEnum.PRODUCT_QUESTION]: 'mdi-package-variant-closed',
    [MessageTypeEnum.ORDER_QUESTION]: 'mdi-cart-outline'
};
