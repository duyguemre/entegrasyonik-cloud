import { PLATFORM_PROCESS } from '@interfaces/index';
import { getColoredPrefix, LoggerType } from '../../utils/Logger';

export abstract class BaseWorker {
    protected abstract readonly workerName: LoggerType; // Tip güvenliği sağladık

    /**
     * Dinamik ve renkli log prefix'i oluşturur.
     * Örnek çıktı: [Client 2 - trendyol - Importer] (Importer renginde)
     */

    public async runOnce(clientId: string, integrationCode: string, mode: PLATFORM_PROCESS, batchId: string) { }


    protected getLogPrefix(clientId: number | string, integrationCode: string = ''): string {
        const parts = [
            clientId ? `Client ${clientId}` : '',
            integrationCode ? integrationCode : '',
            this.workerName
        ].filter(Boolean);

        const dynamicLabel = parts.join(' - ');

        // Rengi workerName'den al, metin olarak dynamicLabel'ı bas
        return getColoredPrefix(this.workerName, dynamicLabel);
    }


    /**
 * Senin 13 maddelik öncelik listene göre dinamik puan hesaplar.
 * Orchestrator bu puana göre .sort({ priorityScore: -1 }) yaparak en üsttekini alır.
 */
    protected calculatePriorityScore = (mode: string, status: string): number => {
        // 13. Madde: Tüm modlar için WAITING en düşük önceliktir
        if (status === 'WAITING') return 10;

        const matrix: Record<string, number> = {
            // Fiyat & Stok (Kritik İşlemler)
            [PLATFORM_PROCESS.UPDATE_PRICE + '_PREPARING']: 130, // 1
            [PLATFORM_PROCESS.UPDATE_STOCK + '_PREPARING']: 120, // 2
            [PLATFORM_PROCESS.UPDATE_PRICE + '_PENDING']: 110, // 3
            [PLATFORM_PROCESS.UPDATE_STOCK + '_PENDING']: 100, // 4
            [PLATFORM_PROCESS.UPDATE_PRICE + '_SENT']: 90,  // 5
            [PLATFORM_PROCESS.UPDATE_STOCK + '_SENT']: 80,  // 6

            // Ürün Güncelleme & Transfer (Normal İşlemler)
            [PLATFORM_PROCESS.UPDATE + '_PREPARING']: 70,  // 7
            [PLATFORM_PROCESS.TRANSFER + '_PREPARING']: 60,  // 8
            [PLATFORM_PROCESS.UPDATE + '_PENDING']: 50,  // 9
            [PLATFORM_PROCESS.TRANSFER + '_PENDING']: 40,  // 10
            [PLATFORM_PROCESS.UPDATE + '_SENT']: 30,  // 11
            [PLATFORM_PROCESS.TRANSFER + '_SENT']: 20,  // 12
            [PLATFORM_PROCESS.UPDATE_VARIANT + '_PREPARING']: 130, // 1
            [PLATFORM_PROCESS.UPDATE_DELIVERY + '_PREPARING']: 120, // 2
            [PLATFORM_PROCESS.UPDATE_VARIANT + '_PENDING']: 110, // 3
            [PLATFORM_PROCESS.UPDATE_DELIVERY + '_PENDING']: 100, // 4
            [PLATFORM_PROCESS.UPDATE_VARIANT + '_SENT']: 90,  // 5
            [PLATFORM_PROCESS.UPDATE_DELIVERY + '_SENT']: 80,  // 6
        };

        const key = `${mode}_${status}`;
        return matrix[key] || 0; // Tanımsız durumlar en sona kalır
    };
}