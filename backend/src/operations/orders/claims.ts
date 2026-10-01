import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { ApplicationError } from '@platform/core/security/Security';
import { ClaimInternalStatusEnum } from '@interfaces/claim';
import { containsRegex, normalizePagination } from '@utils/search';
import type { ClaimPanelRepository } from '@database/repositories/tenant/ClaimPanelRepository';

/**
 * ADR-0024 Dalga 3 (P3-ORD): iade/talep listeleme ve onay/red iş kuralları (pazaryeri bildirimi + yerel durum güncellemesi).
 * Davranış `ClaimService`'in eski gövdeleriyle birebir. Tenant = `clientId` (doğrulanmış principal) + `repo` (tenant DB).
 */
export interface ClaimActionDeps { repo: ClaimPanelRepository; clientId: number }

/**
 * [MM-08 / ADR-0021 aynı desen] getClaims sıralama alanı izin listesi. `ClaimSchema` (Claim.ts) alanlarından,
 * FE iade tablosunun (ClaimListView.vue) sıralanabilir başlıklarına ve mobil sıralama seçeneklerine karşılık gelir.
 * `OrderService.getOrders` ile AYNI keyfi-alan-adı-enjeksiyonu riskini kapatır (BACKLOG "ADR-0021 Aşama A" AÇIK ucu).
 */
export const CLAIM_SORT_FIELDS: readonly string[] = [
    'claimedAt', 'externalClaimId', 'externalOrderId', 'integrationCode', 'internalStatus', 'type', 'totalRefundAmount',
];
const DEFAULT_CLAIM_SORT_FIELD = 'claimedAt';

/** İADELERİ/TALEPLERİ LİSTELEME: sıralama/filtre doğrulaması + sayfalama. */
export async function listClaims(repo: ClaimPanelRepository, searchClaimForm: any): Promise<any> {
    const sort = searchClaimForm?.sort;
    const pagination = normalizePagination(searchClaimForm?.pagination, 15); // [GV-01/MM-08] limit üst sınırı, page>=1
    const filterData = searchClaimForm?.filter || {};

    let direction = 1;
    const sortBy: any = {};

    if (sort && sort.field) {
        direction = sort.direction === 'asc' ? 1 : -1;
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
        filterQuery.$or = [
            { externalClaimId: searchRegex },
            { externalOrderId: searchRegex },
            { "fulfillment.trackingCode": searchRegex }
        ];
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

    const { total: totalRecords, claims } = await repo.listPage(filterQuery, sortBy, skipCount, pagination.limit);

    return {
        totalNumberOfRecords: totalRecords,
        totalNumberOfPages: Math.ceil(totalRecords / pagination.limit) || 1,
        claims: claims
    };
}

/** TALEP REDDİ (Marketplace Entegrasyonlu & Evrensel Parametreli). `rejectData`: `{ reason, reasonId }`. */
export async function rejectClaim(deps: ClaimActionDeps, claimId: any, rejectData: any): Promise<any> {
    const { reason, reasonId } = rejectData;

    const claim = await deps.repo.findById(claimId);
    if (!claim) throw new Error('Talep bulunamadı.');

    const factory = new IntegrationFactory(deps.clientId);
    const instance = await factory.getInstance(claim.integrationCode);

    if (instance.rejectClaim) {
        // --- YENİ: Evrensel Reject Parametre Yapısı ---
        const rejectParams = {
            reasonId: String(reasonId),
            description: reason,
            // Trendyol lineItemIdList için tüm iade satırlarını topluyoruz
            claimItemIdList: claim.items.map((item: any) => item.externalItemId),
            // Trendyol packageId vb. bilgiler için meta çantasını paslıyoruz
            meta: claim.meta
        };

        const marketplaceResult: any = await instance.rejectClaim(claim.externalClaimId, rejectParams);
        // [DÜZELTME 2026-09-29, BACKLOG "4 birikmiş hata düzeltmesi" AÇIK ucu] `approveClaim`'de
        // düzeltilenle AYNI ölü kontrol: `IPlatform.rejectClaim` HER ZAMAN `IPlatformResponse`
        // (obje, `{success:boolean,message?}`) döner -- eski `if (!marketplaceResult)` pazaryeri
        // `{success:false,...}` döndürdüğünde de truthy olduğundan tetiklenmiyordu, iade sessizce
        // yerelde REJECTED işaretleniyordu (characterization: `ClaimService.characterization.test.ts`).
        if (!marketplaceResult || marketplaceResult.success === false) {
            throw new Error(marketplaceResult?.message || 'Pazar yeri red işlemini reddetti veya bir sorun oluştu.');
        }
    } else {
        throw new Error('Bu entegrasyon için rejectClaim metodu henüz yazılmadı.');
    }

    const updatedClaim = await deps.repo.updateById(
        claimId,
        {
            $set: {
                internalStatus: ClaimInternalStatusEnum.REJECTED,
                resolvedAt: new Date(),
                'dates.externalUpdatedAt': new Date(),
                'meta.rejectReason': reason
            },
            $push: {
                history: {
                    status: ClaimInternalStatusEnum.REJECTED,
                    changedAt: new Date(),
                    description: `İade reddedildi. Sebep: ${reason}`,
                    actionBy: 'USER'
                }
            }
        },
        { new: true }
    );

    return {
        success: true,
        message: 'Talep pazar yerinde ve sistemde başarıyla reddedildi.',
        data: updatedClaim
    };
}

/** TALEP ONAYI (Marketplace Entegrasyonlu & Meta Desteği) */
export async function approveClaim(deps: ClaimActionDeps, claimId: any): Promise<any> {
    const claim = await deps.repo.findById(claimId);
    if (!claim) throw new Error('Talep bulunamadı.');

    const factory = new IntegrationFactory(deps.clientId);
    const instance = await factory.getInstance(claim.integrationCode);

    if (instance.approveClaim) {
        // Bazı platformlar onay anında packageId veya meta içinden başka veri bekleyebilir
        const marketplaceResult: any = await instance.approveClaim(claim.externalClaimId, { meta: claim.meta, claimItemIdList: (claim.items || []).map((i: any) => i.externalItemId).filter(Boolean) });
        // [DÜZELTME 2026-09-29, BACKLOG C22] `IPlatform.approveClaim` HER ZAMAN `IPlatformResponse`
        // (obje, `{success:boolean,message?}`) döner -- ASLA `boolean`/`falsy` değil (bkz.
        // interfaces/platforms/index.ts:267). Eski `if (!marketplaceResult)` kontrolü bu yüzden
        // FİİLEN ÖLÜ KODDU: pazaryeri `{success:false,...}` döndürdüğünde obje YİNE truthy olduğundan
        // hata hiç fırlatılmıyor, iade sessizce yerelde APPROVED işaretleniyordu (BULGU, characterization
        // testiyle önce sabitlendi: `tests/characterization/claim-service/ClaimService.characterization.test.ts`).
        // Artık `success` alanı AÇIKÇA kontrol edilir; pazaryeri mesajı varsa kullanıcıya/loga yansır.
        if (!marketplaceResult || marketplaceResult.success === false) {
            throw new Error(marketplaceResult?.message || 'Pazar yeri onay işlemini reddetti.');
        }
    } else {
        throw new Error('Bu entegrasyon için approveClaim metodu henüz yazılmadı.');
    }

    const updatedClaim = await deps.repo.updateById(
        claimId,
        {
            $set: {
                internalStatus: ClaimInternalStatusEnum.APPROVED,
                resolvedAt: new Date(),
                'dates.externalUpdatedAt': new Date()
            },
            $push: {
                history: {
                    status: ClaimInternalStatusEnum.APPROVED,
                    changedAt: new Date(),
                    description: 'İade talebi onaylandı.',
                    actionBy: 'USER'
                }
            }
        },
        { new: true }
    );

    return {
        success: true,
        message: 'Talep başarıyla onaylandı.',
        data: updatedClaim
    };
}

/** TOPLU TALEP ONAYI */
export async function bulkApproveClaims(deps: ClaimActionDeps, claimIds: any): Promise<any> {
    if (!Array.isArray(claimIds) || claimIds.length === 0) {
        throw new Error("Onaylanacak talep seçilmedi.");
    }

    const results = {
        successCount: 0,
        failedCount: 0,
        successful: [] as any[],
        failed: [] as any[]
    };

    const instanceCache: Map<string, any> = new Map();
    const factory = new IntegrationFactory(deps.clientId);

    for (const claimId of claimIds) {
        try {
            const claim = await deps.repo.findById(claimId);
            if (!claim) throw new Error(`${claimId} nolu talep sistemde bulunamadı.`);

            let instance = instanceCache.get(claim.integrationCode);
            if (!instance) {
                instance = await factory.getInstance(claim.integrationCode);
                instanceCache.set(claim.integrationCode, instance);
            }

            if (instance.approveClaim) {
                // Toplu onayda da meta desteğini koruyoruz
                const marketplaceResult: any = await instance.approveClaim(claim.externalClaimId, { meta: claim.meta, claimItemIdList: (claim.items || []).map((i: any) => i.externalItemId).filter(Boolean) });
                // [DÜZELTME 2026-09-29, BACKLOG "4 birikmiş hata düzeltmesi" AÇIK ucu] `approveClaim`'de
                // düzeltilenle AYNI ölü kontrol -- bkz. approveClaim/rejectClaim'deki açıklama.
                if (!marketplaceResult || marketplaceResult.success === false) {
                    throw new Error(marketplaceResult?.message || 'Pazar yeri bu onayı kabul etmedi.');
                }
            }

            await deps.repo.updateById(
                claimId,
                {
                    $set: {
                        internalStatus: ClaimInternalStatusEnum.APPROVED,
                        resolvedAt: new Date(),
                        'dates.externalUpdatedAt': new Date()
                    },
                    $push: {
                        history: {
                            status: ClaimInternalStatusEnum.APPROVED,
                            changedAt: new Date(),
                            description: 'Toplu onay işlemi ile onaylandı.',
                            actionBy: 'USER'
                        }
                    }
                }
            );

            results.successful.push({ claimId, externalClaimId: claim.externalClaimId });
            results.successCount++;

        } catch (error: any) {
            results.failed.push({
                claimId,
                errorMessage: error.message || "Bilinmeyen hata"
            });
            results.failedCount++;
        }
    }

    return {
        success: results.failedCount === 0,
        message: `${results.successCount} talep onaylandı, ${results.failedCount} hata alındı.`,
        data: results
    };
}

/** TEKİL TALEP GETİRME (Detay Ekranı İçin) */
export async function getClaimById(repo: ClaimPanelRepository, claimId: any): Promise<any> {
    const claim = await repo.findByIdPopulated(claimId);

    if (!claim) throw new Error('Talep bulunamadı.');

    return claim;
}
