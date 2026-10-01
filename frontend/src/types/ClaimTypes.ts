export enum ClaimInternalStatusEnum {
    WAITING = 'WAITING',
    UNDER_REVIEW = 'UNDER_REVIEW',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    CANCELLED = 'CANCELLED',
    DISPUTED = 'DISPUTED',
    COMPLETED = 'COMPLETED'
}

export const CLAIM_INTERNAL_STATUS_LABELS: Record<ClaimInternalStatusEnum, string> = {
    [ClaimInternalStatusEnum.WAITING]: 'Yeni Talep',
    [ClaimInternalStatusEnum.UNDER_REVIEW]: 'İncelemede',
    [ClaimInternalStatusEnum.APPROVED]: 'Onaylandı',
    [ClaimInternalStatusEnum.REJECTED]: 'Reddedildi',
    [ClaimInternalStatusEnum.CANCELLED]: 'İptal Edildi',
    [ClaimInternalStatusEnum.DISPUTED]: 'İtirazda',
    [ClaimInternalStatusEnum.COMPLETED]: 'Tamamlandı'
};

export const CLAIM_INTERNAL_STATUS_COLORS: Record<ClaimInternalStatusEnum, string> = {
    [ClaimInternalStatusEnum.WAITING]: 'info',
    [ClaimInternalStatusEnum.UNDER_REVIEW]: 'warning',
    [ClaimInternalStatusEnum.APPROVED]: 'success',
    [ClaimInternalStatusEnum.REJECTED]: 'error',
    [ClaimInternalStatusEnum.CANCELLED]: 'neutral',
    [ClaimInternalStatusEnum.DISPUTED]: 'warning',
    [ClaimInternalStatusEnum.COMPLETED]: 'success'
};