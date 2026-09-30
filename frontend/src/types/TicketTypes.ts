export enum TicketStatusEnum {
    OPEN = "OPEN",
    IN_PROGRESS = "IN_PROGRESS",
    WAITING_CLIENT = "WAITING_CLIENT",
    RESOLVED = "RESOLVED",
    CLOSED = "CLOSED",
}

export enum TicketTypeEnum {
    GENERAL = "GENERAL",
    TECHNICAL = "TECHNICAL",
    BILLING = "BILLING",
    FEATURE_REQUEST = "FEATURE_REQUEST",
    BUG = "BUG",
    OTHER = "OTHER",
}

export enum TicketPriorityEnum {
    LOW = "LOW",
    MEDIUM = "MEDIUM",
    HIGH = "HIGH",
    URGENT = "URGENT",
}

export const TICKET_STATUS_LABELS: Record<TicketStatusEnum, string> = {
    [TicketStatusEnum.OPEN]: 'Açık',
    [TicketStatusEnum.IN_PROGRESS]: 'İşleniyor',
    [TicketStatusEnum.WAITING_CLIENT]: 'Yanıt Bekliyor',
    [TicketStatusEnum.RESOLVED]: 'Çözüldü',
    [TicketStatusEnum.CLOSED]: 'Kapatıldı',
};

export const TICKET_STATUS_COLORS: Record<TicketStatusEnum, string> = {
    [TicketStatusEnum.OPEN]: 'info',
    [TicketStatusEnum.IN_PROGRESS]: 'warning',
    [TicketStatusEnum.WAITING_CLIENT]: 'warning',
    [TicketStatusEnum.RESOLVED]: 'success',
    [TicketStatusEnum.CLOSED]: 'neutral',
};

export const TICKET_TYPE_LABELS: Record<TicketTypeEnum, string> = {
    [TicketTypeEnum.GENERAL]: 'Genel',
    [TicketTypeEnum.TECHNICAL]: 'Teknik Destek',
    [TicketTypeEnum.BILLING]: 'Muhasebe / Fatura',
    [TicketTypeEnum.FEATURE_REQUEST]: 'Özellik Talebi',
    [TicketTypeEnum.BUG]: 'Hata Bildirimi',
    [TicketTypeEnum.OTHER]: 'Diğer',
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriorityEnum, string> = {
    [TicketPriorityEnum.LOW]: 'Düşük',
    [TicketPriorityEnum.MEDIUM]: 'Orta',
    [TicketPriorityEnum.HIGH]: 'Yüksek',
    [TicketPriorityEnum.URGENT]: 'Acil',
};

export const TICKET_PRIORITY_COLORS: Record<TicketPriorityEnum, string> = {
    [TicketPriorityEnum.LOW]: 'success',
    [TicketPriorityEnum.MEDIUM]: 'info',
    [TicketPriorityEnum.HIGH]: 'warning',
    [TicketPriorityEnum.URGENT]: 'error',
};
