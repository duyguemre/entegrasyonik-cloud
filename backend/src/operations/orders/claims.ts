import { IClientDB } from '@interfaces/index';
import { ClaimInternalStatusEnum } from '@interfaces/claim';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { ClaimRepository } from '@database/repositories/tenant/ClaimRepository';
import { ApplicationError } from '@platform/core/security/Security';
import { containsRegex, normalizePagination } from '@utils/search';

/**
 * ADR-0024 P3-ORD: iade/talep listeleme ve satıcı kararı (onay/red), eski `ClaimService` gövdesi; davranış BİREBİR.
 * Pazaryeri kararı ÖNCE; `IPlatform.approveClaim/rejectClaim` HER ZAMAN `{success, message?}` döner -> `success === false`
 * açıkça kontrol edilir (eski `!result` kontrolü ölüydü, BACKLOG C22; characterization: ClaimService.characterization.test.ts).
 */
export interface ClaimDeps { clientDB: IClientDB; clientId: unknown }

/**
 * [MM-08 / ADR-0021 aynı desen] getClaims sıralama alanı izin listesi (`ClaimSchema` alanları; FE ClaimListView.vue
 * sıralanabilir başlıkları + mobil sıralama seçenekleri). Keyfi alan adı enjeksiyonunu kapatır.
 */
const CLAIM_SORT_FIELDS: readonly string[] = [
    'claimedAt', 'externalClaimId', 'externalOrderId', 'integrationCode', 'internalStatus', 'type', 'totalRefundAmount',
];
const DEFAULT_CLAIM_SORT_FIELD = 'claimedAt';

const claimItemIds = (claim: any) => (claim.items || []).map((i: any) => i.externalItemId).filter(Boolean);

function approvedUpdate(description: string) {
    return {
        $set: { internalStatus: ClaimInternalStatusEnum.APPROVED, resolvedAt: new Date(), 'dates.externalUpdatedAt': new Date() },
        $push: { history: { status: ClaimInternalStatusEnum.APPROVED, changedAt: new Date(), description, actionBy: 'USER' } },
    };
}

/** İADELERİ/TALEPLERİ LİSTELEME */
export async function searchClaims(clientDB: IClientDB, searchClaimForm: any) {
    const sort = searchClaimForm?.sort;
    const pagination = normalizePagination(searchClaimForm?.pagination, 15); // [GV-01/MM-08] limit üst sınırı, page>=1
    const filterData = searchClaimForm?.filter || {};

    const sortBy: any = {};
    if (sort && sort.field) {
        const direction = sort.direction === 'asc' ? 1 : -1;
        if (typeof sort.field !== 'string' || !CLAIM_SORT_FIELDS.includes(sort.field)) {
            throw new ApplicationError('sort.field geçersiz: ' + CLAIM_SORT_FIELDS.join(', ') + ' değerlerinden biri olmalıdır.', 400);
        }
        sortBy[sort.field] = direction;
    } else {
        sortBy[DEFAULT_CLAIM_SORT_FIELD] = -1;
    }

    const filterQuery: any = {};
    if (filterData.globalSearch) {
        const searchRegex = containsRegex(filterData.globalSearch); // [GV-01] kaçışlı + uzunluk sınırlı
        filterQuery.$or = [{ externalClaimId: searchRegex }, { externalOrderId: searchRegex }, { 'fulfillment.trackingCode': searchRegex }];
    }
    if (filterData.startDate || filterData.endDate) {
        filterQuery.claimedAt = {};
        if (filterData.startDate) filterQuery.claimedAt.$gte = new Date(filterData.startDate);
        if (filterData.endDate) {
            const end = new Date(filterData.endDate);
            end.setHours(23, 59, 59, 999);
            filterQuery.claimedAt.$lte = end;
        }
    }
    if (filterData.integrationCodes?.length > 0) filterQuery.integrationCode = { $in: filterData.integrationCodes };
    if (filterData.internalStatuses?.length > 0) filterQuery.internalStatus = { $in: filterData.internalStatuses };
    if (filterData.types?.length > 0) filterQuery.type = { $in: filterData.types };

    const skipCount = (pagination.page - 1) * pagination.limit;
    const { total, items } = await new ClaimRepository(clientDB).pagedSearch(filterQuery, sortBy, skipCount, pagination.limit);
    return { totalNumberOfRecords: total, totalNumberOfPages: Math.ceil(total / pagination.limit) || 1, claims: items };
}

/** TALEP REDDİ (evrensel red parametreleri: tüm iade satırları + meta). */
export async function rejectClaim(deps: ClaimDeps, claimId: unknown, reason: unknown, reasonId: unknown) {
    const repo = new ClaimRepository(deps.clientDB);
    const claim = await repo.findById(claimId);
    if (!claim) throw new Error('Talep bulunamadı.');

    const factory = new IntegrationFactory(Number(deps.clientId));
    const instance = await factory.getInstance(claim.integrationCode);
    if (!instance.rejectClaim) throw new Error('Bu entegrasyon için rejectClaim metodu henüz yazılmadı.');
    // Evrensel red parametreleri: Trendyol lineItemIdList için tüm iade satırları, packageId vb. için meta
    const rejectParams = {
        reasonId: String(reasonId),
        description: reason as any,
        claimItemIdList: claim.items.map((item: any) => item.externalItemId),
        meta: claim.meta,
    };
    const marketplaceResult: any = await instance.rejectClaim(claim.externalClaimId, rejectParams);
    if (!marketplaceResult || marketplaceResult.success === false) {
        throw new Error(marketplaceResult?.message || 'Pazar yeri red işlemini reddetti veya bir sorun oluştu.');
    }

    const updatedClaim = await repo.updateById(claimId, {
        $set: { internalStatus: ClaimInternalStatusEnum.REJECTED, resolvedAt: new Date(), 'dates.externalUpdatedAt': new Date(), 'meta.rejectReason': reason },
        $push: { history: { status: ClaimInternalStatusEnum.REJECTED, changedAt: new Date(), description: `İade reddedildi. Sebep: ${reason}`, actionBy: 'USER' } },
    }, { new: true });
    return { success: true, message: 'Talep pazar yerinde ve sistemde başarıyla reddedildi.', data: updatedClaim };
}

/** TALEP ONAYI (meta + iade satır kimlikleri platforma iletilir). */
export async function approveClaim(deps: ClaimDeps, claimId: unknown) {
    const repo = new ClaimRepository(deps.clientDB);
    const claim = await repo.findById(claimId);
    if (!claim) throw new Error('Talep bulunamadı.');

    const factory = new IntegrationFactory(Number(deps.clientId));
    const instance = await factory.getInstance(claim.integrationCode);
    if (!instance.approveClaim) throw new Error('Bu entegrasyon için approveClaim metodu henüz yazılmadı.');
    const marketplaceResult: any = await instance.approveClaim(claim.externalClaimId, { meta: claim.meta, claimItemIdList: claimItemIds(claim) });
    if (!marketplaceResult || marketplaceResult.success === false) {
        throw new Error(marketplaceResult?.message || 'Pazar yeri onay işlemini reddetti.');
    }

    const updatedClaim = await repo.updateById(claimId, approvedUpdate('İade talebi onaylandı.'), { new: true });
    return { success: true, message: 'Talep başarıyla onaylandı.', data: updatedClaim };
}

/** TOPLU TALEP ONAYI (adaptör `approveClaim` sunmuyorsa platform adımı atlanır, yerel onay yazılır — eski davranış). */
export async function bulkApproveClaim(deps: ClaimDeps, claimIds: unknown) {
    if (!Array.isArray(claimIds) || claimIds.length === 0) throw new Error('Onaylanacak talep seçilmedi.');

    const results = { successCount: 0, failedCount: 0, successful: [] as any[], failed: [] as any[] };
    const instanceCache: Map<string, any> = new Map();
    const factory = new IntegrationFactory(Number(deps.clientId));
    const repo = new ClaimRepository(deps.clientDB);

    for (const claimId of claimIds) {
        try {
            const claim = await repo.findById(claimId);
            if (!claim) throw new Error(`${claimId} nolu talep sistemde bulunamadı.`);
            let instance = instanceCache.get(claim.integrationCode);
            if (!instance) {
                instance = await factory.getInstance(claim.integrationCode);
                instanceCache.set(claim.integrationCode, instance);
            }
            if (instance.approveClaim) {
                const marketplaceResult: any = await instance.approveClaim(claim.externalClaimId, { meta: claim.meta, claimItemIdList: claimItemIds(claim) });
                if (!marketplaceResult || marketplaceResult.success === false) {
                    throw new Error(marketplaceResult?.message || 'Pazar yeri bu onayı kabul etmedi.');
                }
            }
            await repo.updateById(claimId, approvedUpdate('Toplu onay işlemi ile onaylandı.'));
            results.successful.push({ claimId, externalClaimId: claim.externalClaimId });
            results.successCount++;
        } catch (error: any) {
            results.failed.push({ claimId, errorMessage: error.message || 'Bilinmeyen hata' });
            results.failedCount++;
        }
    }
    return {
        success: results.failedCount === 0,
        message: `${results.successCount} talep onaylandı, ${results.failedCount} hata alındı.`,
        data: results,
    };
}

/** TEKİL TALEP (detay ekranı): müşteri ve sipariş özetiyle. */
export async function getClaimById(clientDB: IClientDB, claimId: unknown) {
    const claim = await new ClaimRepository(clientDB).findById(claimId)
        .populate('customerId')
        .populate('orderId', 'orderNumber status');
    if (!claim) throw new Error('Talep bulunamadı.');
    return claim;
}
