import { DatabaseManagerInstance } from "@database/DatabaseManager";
import type { JobOutcome } from "@platform/runtime/scheduler";
import { EVENTS, integrationEventBus } from "../../IntegrationEventBus";

/**
 * [ADR-0024 P0-LIFE] Zamanlama kaydı (aralık/süre sınırı) `bootstrap/schedules.ts`'e taşındı; bu dosya yalnız tur mantığıdır.
 * [ADR-0016 §2.4, Alternatif C3 / MM-14] `web` -> `worker` sinyal kaybı düzeltmesi.
 *
 * BUGÜNKÜ SORUN (MASTER_STATE/BACKEND_CODE_AUDIT MM-14): `PROCESS_NEXT_SIGNAL` yalnızca süreç-içi bir
 * `EventEmitter`'dır (`IntegrationEventBus.ts`). `web` rolündeki bir pod'da bir kullanıcı eylemiyle yeni bir
 * `ExportSignal` (ör. `QUEUED`) yaratıldığında, bu olayı dinleyen `ExportOrchestrator.startLoop` YALNIZCA
 * `worker` rolündeki (AYRI süreç/pod) döngüde çalışır -- emit ASLA oraya ULAŞMAZ. Sonuç: `worker` en kötü
 * durumda kendi boşta bekleme süresi (`export.config.json.exportOrchestrator.exportLoopDelay`, varsayılan
 * 5 dk) kadar YENİ işi FARK ETMEZ.
 *
 * ÇÖZÜM (ADR-0016 §2.4 Alternatif C3, Redis pub/sub KURULMAZ -- ADR-0005 sınırı korunur): `platform/runtime/
 * scheduler` ile HER `EXPORT_IDLE_POLL_MS` (varsayılan 15 sn) `ExportSignals`'ta işlenecek (kilitlenmemiş,
 * zamanı gelmiş) bir kayıt olup olmadığı ucuz bir indeksli `findOne` ile kontrol edilir; varsa AYNI SÜREÇTEKİ
 * `integrationEventBus`'a `PROCESS_NEXT_SIGNAL` emit edilir. Bu iş `worker`/`all` rolünde, `ExportOrchestrator`
 * ile AYNI süreçte çalıştığından emit -> dinleyici (`ExportOrchestrator.startLoop`) HER ZAMAN aynı süreç
 * içindir; web pod'un kendi emit'i kaybolsa bile worker'ın KENDİ 15 sn'lik turu farkına varır.
 *
 * MİNİMAL/İZOLE DEĞİŞİKLİK (Protokol 13): `ExportOrchestrator.ts` (0-kapsamlı, dokunma yasaklı, karakterizasyon
 * testi VAR ama katalog motoru YENİDEN YAZILMAZ) HİÇ DEĞİŞTİRİLMEDİ. Bu dosya YALNIZCA mevcut, herkese açık
 * `integrationEventBus`'a (Dispatcher/Sync'in de kullandığı AYNI singleton) dışarıdan bir olay EKLER -- yeni bir
 * bağımlılık yönü veya iç durum değişikliği YOK. `ExportOrchestrator.startLoop`'un KENDİ periyodik DB sorgusu
 * (`dynamicDelay`/`nextPotentialSignal`) da AYNEN kalır; bu iş yalnız o beklemeyi ERKEN KESER.
 */
export async function runExportSignalPoll(): Promise<JobOutcome> {
    const applicationDB = await DatabaseManagerInstance.getApplicationDB();
    const signalModel = applicationDB.getExportSignalModel();
    const pending = await signalModel.findOne({
        lockedBy: null,
        nextRunAt: { $lte: new Date() },
        status: { $in: ['PREPARING', 'QUEUED', 'PENDING', 'SENT', 'WAITING'] },
    }).select('_id').lean();

    if (pending) integrationEventBus.emit(EVENTS.PROCESS_NEXT_SIGNAL);
    return { processed: pending ? 1 : 0 };
}
