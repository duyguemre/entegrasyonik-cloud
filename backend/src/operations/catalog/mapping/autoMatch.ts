// ADR-0024 Dalga 3 (P3-CAT): yerel yaprak kategorileri platform kategorilerine + özelliklerine otomatik eşleme iş kuralı
// (`AttributeMappingService.autoMatchAllCategories`'ten taşındı; davranış birebir). DB'ye yalnız verilen depolar üzerinden erişir.
//  - Yazma TOPLU (`bulkWrite`, `$setOnInsert` upsert): var olan (kullanıcının yaptığı) eşleme ASLA ezilmez; N+1 yazma yok.
//  - Hata YUTULMAZ (ADR-0006): platform çağrısı/yazma hatası fırlar. Tek tek kategori hataları yanıtın `failed` listesinde raporlanır;
//    HEPSİ başarısızsa 502 fırlatılır.
//  - V2'de değerleri gömülü gelmeyen (allowCustom olmayan) özelliklerde eşleme YAZILMAZ; `skipped` listesinde raporlanır.
import stringSimilarity from 'string-similarity'
import { ApplicationError } from '@platform/core/security/Security'
import type { AttributeMappingRepository } from '@database/repositories/tenant/AttributeMappingRepository'
import type { CategoryRepository } from '@database/repositories/tenant/CategoryRepository'
import type { ChoiceRepository } from '@database/repositories/tenant/ChoiceRepository'

const BULK_CHUNK = 500
const REPORT_CAP = 200

export interface AutoMatchDeps {
    platformCode: string
    mappings: AttributeMappingRepository
    categories: CategoryRepository
    choices: ChoiceRepository
    /** Platform adaptörünü verir (okumalardan SONRA çağrılır; hata yutulmaz). */
    getIntegration: (code: string) => Promise<any>
}

export async function autoMatchAllCategories(deps: AutoMatchDeps): Promise<any> {
    const { platformCode, mappings, categories, choices, getIntegration } = deps
    // 1. Verileri toplu çek (tek seferde DB okuma)
    const [rawChoices, allLocalCategories] = await Promise.all([
        choices.findAll(),
        categories.findAll()
    ]);

    const allMyChoices = rawChoices.map((c: any) => ({
        _id: c._id?.$oid || c._id?.toString(),
        title: c.title,
        values: (c.values || []).map((v: any) => ({
            _id: v._id?.$oid || v._id?.toString(),
            title: v.title
        }))
    }));
    const allChoiceTitles = allMyChoices.map((c: any) => c.title.toLocaleUpperCase('tr'));
    const localCatMap = new Map(allLocalCategories.map((c: any) => [c._id.toString(), c]));
    const localLeafCategories = allLocalCategories.filter((c: any) => !c.children || c.children.length === 0);

    // Mevcut eşlemeler hafızada (döngü içinde sorgu yok)
    const existingMappings: any[] = await mappings.listByIntegration(platformCode);
    const existingCategoryMaps = new Map<string, any>();
    for (const m of existingMappings) if (m.isCategoryMapping === true) existingCategoryMaps.set(String(m.localCategoryId), m);
    const existingAttrKeys = new Set<string>(existingMappings.filter((m: any) => m.platformAttributeId != null).map((m: any) => `${m.localCategoryId}|${m.platformAttributeId}`));

    let matchedCount = 0;
    const categoryOps: any[] = [];
    const attributeOps: any[] = [];
    const skipped: any[] = [];
    const failed: any[] = [];
    let skippedCount = 0;

    // Platform kategori özellik önbelleği (aynı kategori için tekrar API'ye gitmez)
    const platformAttrCache = new Map<string, any>();

    const cleanTitle = (text: string) => {
        return text
            .toLocaleUpperCase('tr')
            .replace(/[&/\\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // Platform çağrıları hata verirse YUTULMAZ: doğrudan fırlar.
    const integration = await getIntegration(platformCode);
    const rawRemoteCategories = await integration.retrieveCategories();

    const flattenRemote = (items: any[], parentPath: string = ""): any[] => {
        let flat: any[] = [];
        if (!Array.isArray(items)) return flat;
        items.forEach(item => {
            const currentPath = parentPath ? `${parentPath} > ${item.title}` : item.title;
            const node = { ...item, fullPath: currentPath.toLocaleUpperCase('tr') };
            flat.push(node);
            if (item.children?.length > 0) flat = flat.concat(flattenRemote(item.children, currentPath));
        });
        return flat;
    };

    const allRemoteNodes = flattenRemote(rawRemoteCategories);
    const remoteLeafs = allRemoteNodes.filter(c => !c.children || c.children.length === 0);

    const processCategory = async (localCat: any) => {
        const localTitleRaw = localCat.title.toLocaleUpperCase('tr').trim();
        const localTitleClean = cleanTitle(localTitleRaw);

        let localPath = localTitleRaw;
        if (localCat.parentId) {
            const parent: any = localCatMap.get(localCat.parentId.toString());
            if (parent) localPath = `${parent.title.toLocaleUpperCase('tr')} > ${localPath}`;
        }

        let platformCategoryId: string | undefined = existingCategoryMaps.get(localCat._id.toString())?.platformCategoryId;

        // --- KATEGORİ EŞLEŞTİRME ---
        if (!platformCategoryId) {
            let bestMatchNode = null;
            let highestScore = 0;

            for (const remoteLeaf of remoteLeafs) {
                const remoteTitleRaw = remoteLeaf.title.toLocaleUpperCase('tr').trim();
                const remoteTitleClean = cleanTitle(remoteTitleRaw);

                // KEK KORUMASI: Kelime Dizileri üzerinden tam eşleşme kontrolü
                const localWords = localTitleClean.split(/\s+/).filter((w: string) => w.length > 1);
                const remoteWords = remoteTitleClean.split(/\s+/).filter((w: string) => w.length > 1);

                // ERKEK içindeki KEK'i engeller (Array.includes tam kelime arar)
                const hasExactWordMatch = localWords.some((lw: string) => remoteWords.includes(lw)) ||
                    remoteWords.some((rw: string) => localWords.includes(rw));

                const titleScore = stringSimilarity.compareTwoStrings(localTitleClean, remoteTitleClean);
                const pathScore = stringSimilarity.compareTwoStrings(localPath, remoteLeaf.fullPath);

                let totalScore = (titleScore * 0.7) + (pathScore * 0.3);

                // GÜVENLİK: Tam kelime uyuşmuyorsa ve skor %95 değilse ÇÖP say
                if (!hasExactWordMatch && totalScore < 0.95) {
                    totalScore = 0;
                }

                // Kısa kelime bariyeri
                if (remoteTitleClean.length <= 3 && !localWords.includes(remoteTitleClean)) {
                    totalScore = 0;
                }

                // BONUS: İçerme (Düz Bot -> Bot & Bootie durumunu kurtarır)
                const isIncluded = remoteTitleClean.includes(localTitleClean) || localTitleClean.includes(remoteTitleClean);
                const finalScore = (isIncluded && totalScore > 0 && totalScore < 0.85) ? 0.86 : totalScore;

                if (finalScore > highestScore) {
                    highestScore = finalScore;
                    bestMatchNode = remoteLeaf;
                }
            }

            if (highestScore >= 0.85 && bestMatchNode) {
                platformCategoryId = String((bestMatchNode as any)._id);
                categoryOps.push({
                    updateOne: {
                        filter: { localCategoryId: localCat._id, integrationCode: platformCode, platformAttributeId: null },
                        update: { $setOnInsert: { platformCategoryId, isCategoryMapping: true, updatedAt: new Date() } },
                        upsert: true
                    }
                });
                matchedCount++;
            }
        }

        // --- NİTELİK EŞLEŞTİRME ---
        if (!platformCategoryId) return;
        let pAttrs = platformAttrCache.get(platformCategoryId);
        if (!pAttrs) {
            pAttrs = await integration.retrieveCategoryAttributes(platformCategoryId);
            platformAttrCache.set(platformCategoryId, pAttrs);
        }
        if (!Array.isArray(pAttrs)) return;

        for (const pAttr of pAttrs) {
            const attrMatch = stringSimilarity.findBestMatch(pAttr.title.toLocaleUpperCase('tr'), allChoiceTitles);
            if (attrMatch.bestMatch.rating < 0.80) continue;
            const matchedChoice = allMyChoices[attrMatch.bestMatchIndex];

            if (existingAttrKeys.has(`${localCat._id}|${String(pAttr._id)}`)) continue;

            const pValues = pAttr.values;
            const matchedValues: any[] = [];

            if (matchedChoice.values?.length > 0) {
                if (pAttr.allowCustom === true) {
                    for (const myVal of matchedChoice.values) {
                        matchedValues.push({ localValueId: myVal._id, platformValueId: null, platformValueName: myVal.title });
                    }
                } else if (Array.isArray(pValues)) {
                    const myValTitles = matchedChoice.values.map((v: any) => v.title.toLocaleUpperCase('tr'));
                    for (const pVal of pValues) {
                        const vMatch = stringSimilarity.findBestMatch(pVal.title.toLocaleUpperCase('tr'), myValTitles);
                        if (vMatch.bestMatch.rating >= 0.85) {
                            matchedValues.push({
                                localValueId: matchedChoice.values[vMatch.bestMatchIndex]._id,
                                platformValueId: String(pVal.id),
                                platformValueName: pVal.title
                            });
                        }
                    }
                } else {
                    // V2: değerler ayrı uçta; gömülü değil -> boş eşleme YAZMA, raporla.
                    skippedCount++;
                    if (skipped.length < REPORT_CAP) {
                        skipped.push({ localCategoryId: String(localCat._id), platformCategoryId, platformAttributeId: String(pAttr._id), reason: 'PLATFORM_VALUES_NOT_EMBEDDED' });
                    }
                    continue;
                }
            }

            attributeOps.push({
                updateOne: {
                    filter: { localCategoryId: localCat._id, integrationCode: platformCode, platformAttributeId: String(pAttr._id) },
                    update: {
                        $setOnInsert: {
                            platformCategoryId: String(platformCategoryId),
                            platformAttributeName: pAttr.title,
                            localChoiceId: matchedChoice._id,
                            isVarianter: !!pAttr.varianter,
                            isSlicer: !!pAttr.slicer,
                            isRequired: !!pAttr.required,
                            isCategoryMapping: false,
                            values: matchedValues,
                            updatedAt: new Date()
                        }
                    },
                    upsert: true
                }
            });
        }
    };

    // Rate-limit dostu: 15'erli paketler halinde paralel; tek kategori hatası raporlanır (yutulmaz, sayılır).
    const chunkSize = 15;
    for (let i = 0; i < localLeafCategories.length; i += chunkSize) {
        const chunk = localLeafCategories.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (localCat: any) => {
            try {
                await processCategory(localCat);
            } catch (e: any) {
                failed.push({ localCategoryId: String(localCat._id), title: localCat.title, reason: String(e?.message ?? e).slice(0, 300) });
            }
        }));
    }

    if (localLeafCategories.length > 0 && failed.length === localLeafCategories.length) {
        throw new ApplicationError(`Otomatik eşleme başarısız (${platformCode}): ${failed[0].reason}`, 502);
    }

    // Toplu yazma (yazma hatası fırlar). Kategori kayıtları önce: özellik kayıtları onlara referans verir.
    for (const ops of [categoryOps, attributeOps]) {
        for (let i = 0; i < ops.length; i += BULK_CHUNK) {
            await mappings.bulkWrite(ops.slice(i, i + BULK_CHUNK));
        }
    }

    return {
        result: true,
        matchedCount,
        attributeMappingCount: attributeOps.length,
        skippedCount,
        skipped,
        failedCount: failed.length,
        failed: failed.slice(0, REPORT_CAP),
    };
}
