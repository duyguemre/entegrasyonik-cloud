// ADR-0018 Karar 2a — Pasif sözleşme bekçisi. DAVRANIŞ KESİN KURALI: gözlem YALNIZCA; yanıtı ASLA
// değiştirmez, reddetmez, fırlatmaz. Her çağrı `Promise.resolve().then(...).catch(()=>{})` ile ERTELENİR
// (çağıranın ana akışını asla geciktirmez/bloklamaz) ve kendi hatası YUTULUR (ErrorEvents'e gitmesi
// Aşama B'nin işi; bugün `console.error` best-effort).
//
// Bu modülün İÇE AKTARILMASI (`import`), `reportUnknownEnum.ts`'in sink'ini `FindingService.report`'a
// BAĞLAR (modül-yükleme yan etkisi — bkz. dosya sonu). `ResilientHttpClient` bu modülü içe aktardığı için
// TÜM adaptör HTTP çağrıları otomatik olarak bu bağlantıyı kurar; ayrı bir bootstrap adımı GEREKMEZ.
import type { ZodTypeAny } from 'zod';
import { FindingService, computeDefaultSeverity } from './FindingService';
import { computeShapeFingerprint } from './ShapeFingerprint';
import { setUnknownEnumSink, type UnknownEnumEvent } from '@integration/modules/common/contract/reportUnknownEnum';
// BİLİNÇLİ OLARAK `IntegrationDescriptorRegistry` DEĞİL: o, tüm adaptör `descriptor.ts`/`limits.ts`
// dosyalarını (ve dolayısıyla `ResilientHttpClient`'ı) içe aktarır -> DÖNGÜSEL bağımlılık oluşur
// (bkz. `codeToCategory.ts` dosya başı yorumu; dependency-cruiser `no-circular` ile doğrulandı).
import { categoryOfIntegrationCode } from '@integration/catalog/codeToCategory';

export interface ContractRef {
    /** İzlenen işlem sözleşme kimliği, ör. 'trendyol.orders.list@v2'. */
    id: string;
    category: string;
    schema: ZodTypeAny;
}

const SAFE_KEY_PATH = /^[A-Za-z0-9_\-[\]().]{1,120}$/;

function safePath(p: string): string {
    return SAFE_KEY_PATH.test(p) ? p : '<redacted-path>';
}

/**
 * Bir yanıt gövdesini (veya çağıranın seçtiği alt kümesini) sözleşmeye karşı DOĞRULAR. Gözlem yalnızca;
 * dönüş değeri YOKTUR (fire-and-forget). Şema `zod` `.strict()` ile yazılmalıdır — bu, bekçinin hem eksik/
 * tip uyuşmazlığını (`schema_mismatch`) hem şemada olmayan yeni alanı (`unknown_fields`) TEK geçişte
 * ayırt etmesini sağlar (ADR-0018 Karar 2a (i)+(ii)); adaptörün GERÇEK istek/yanıt akışı bu şemadan
 * TAMAMEN bağımsızdır (adaptör kendi ayrıştırmasını kendi yapar, burası yalnız bir gölge kontrolüdür).
 */
export function observeContract(
    ref: ContractRef,
    integrationCode: string,
    tenantId: number | undefined,
    data: unknown,
): void {
    Promise.resolve().then(() => {
        const fingerprint = computeShapeFingerprint(data);
        const result = ref.schema.safeParse(data);
        if (result.success) return;

        const unknownKeyPaths: string[] = [];
        const mismatchPaths: string[] = [];
        const mismatchTypes: string[] = [];
        for (const issue of result.error.issues) {
            const rootPath = issue.path.join('.'); // kök nesnede '' (boş)
            if (issue.code === 'unrecognized_keys') {
                for (const k of issue.keys) unknownKeyPaths.push(safePath(rootPath ? `${rootPath}.${k}` : k));
            } else {
                mismatchPaths.push(safePath(rootPath || '(root)'));
                mismatchTypes.push(issue.code);
            }
        }

        if (unknownKeyPaths.length > 0) {
            void FindingService.report({
                integrationCode, category: ref.category, kind: 'schema', source: 'guard',
                subjectKey: `${ref.id}#unknown_fields`, signature: [...unknownKeyPaths].sort().join(','),
                severity: 'low', tenantId,
                evidence: { paths: unknownKeyPaths, fingerprint },
            });
        }
        if (mismatchPaths.length > 0) {
            void FindingService.report({
                integrationCode, category: ref.category, kind: 'schema', source: 'guard',
                subjectKey: `${ref.id}#mismatch`, signature: [...mismatchPaths].sort().join(','),
                severity: computeDefaultSeverity('schema'), tenantId,
                evidence: { paths: mismatchPaths, types: mismatchTypes, fingerprint },
            });
        }
    }).catch((e: any) => {
        // eslint-disable-next-line no-console
        console.error('[ContractGuard.observeContract] gözlem hatası (iş akışını etkilemez):', e?.message);
    });
}

const SUNSET_HIGH_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * `Deprecation`/`Sunset`/`Warning` başlıklarını gözler (ADR-0018 Karar 2a). Başlık ADI kaydedilir, DEĞER
 * yalnızca `Sunset` (tarih) için tutulur (ADR'nin izin verdiği tek istisna). Fire-and-forget.
 */
export function observeResponseHeaders(
    integrationCode: string,
    tenantId: number | undefined,
    operationPath: string,
    headers: Record<string, any> | undefined,
): void {
    if (!headers) return;
    const deprecation = headers['deprecation'] ?? headers['Deprecation'];
    const sunset = headers['sunset'] ?? headers['Sunset'];
    const warning = headers['warning'] ?? headers['Warning'];
    if (!deprecation && !sunset && !warning) return;

    Promise.resolve().then(() => {
        const headerNames: string[] = [];
        if (deprecation) headerNames.push('Deprecation');
        if (sunset) headerNames.push('Sunset');
        if (warning) headerNames.push('Warning');

        let severity: 'high' | 'medium' = 'medium';
        let sunsetAt: string | undefined;
        if (sunset) {
            sunsetAt = String(sunset).slice(0, 64);
            const parsed = Date.parse(sunsetAt);
            if (Number.isFinite(parsed) && (parsed - Date.now()) < SUNSET_HIGH_THRESHOLD_MS) severity = 'high';
        }

        const category = categoryOfIntegrationCode(integrationCode);
        void FindingService.report({
            integrationCode, category, kind: 'deprecation', source: 'guard',
            subjectKey: `${integrationCode}#${operationPath}`, signature: headerNames.sort().join(','),
            severity, tenantId,
            evidence: { headerNames, sunsetAt },
        });
    }).catch((e: any) => {
        // eslint-disable-next-line no-console
        console.error('[ContractGuard.observeResponseHeaders] gözlem hatası (iş akışını etkilemez):', e?.message);
    });
}

// --- Modül-yükleme yan etkisi: reportUnknownEnum sink'ini FindingService'e bağlar (ADR-0018 Karar 2a iii). ---
function integrationCodeFromContractId(contractId: string): string {
    const i = contractId.indexOf('.');
    return i > 0 ? contractId.slice(0, i) : contractId;
}

setUnknownEnumSink((event: UnknownEnumEvent) => {
    const integrationCode = integrationCodeFromContractId(event.contractId);
    const category = categoryOfIntegrationCode(integrationCode);
    void FindingService.report({
        integrationCode, category, kind: 'unknown_enum', source: 'guard',
        subjectKey: `${event.contractId}#${event.field}`, signature: event.value,
        severity: computeDefaultSeverity('unknown_enum'),
        evidence: { enumValue: event.value },
    });
});
