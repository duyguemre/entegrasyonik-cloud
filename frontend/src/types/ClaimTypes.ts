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
    [ClaimInternalStatusEnum.WAITING]: 'İade Talebi Oluşturuldu',
    [ClaimInternalStatusEnum.UNDER_REVIEW]: 'İncelemede',
    [ClaimInternalStatusEnum.APPROVED]: 'Tamamlandı',
    [ClaimInternalStatusEnum.REJECTED]: 'Tamamlandı',
    [ClaimInternalStatusEnum.CANCELLED]: 'İptal Edildi',
    [ClaimInternalStatusEnum.DISPUTED]: 'İncelemede',
    [ClaimInternalStatusEnum.COMPLETED]: 'Tamamlandı'
};

export const CLAIM_INTERNAL_STATUS_COLORS: Record<ClaimInternalStatusEnum, string> = {
    [ClaimInternalStatusEnum.WAITING]: 'info',
    [ClaimInternalStatusEnum.UNDER_REVIEW]: 'warning',
    [ClaimInternalStatusEnum.APPROVED]: 'success',
    [ClaimInternalStatusEnum.REJECTED]: 'success',
    [ClaimInternalStatusEnum.CANCELLED]: 'neutral',
    [ClaimInternalStatusEnum.DISPUTED]: 'warning',
    [ClaimInternalStatusEnum.COMPLETED]: 'success'
};