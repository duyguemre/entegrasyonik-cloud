import { IApplicationDB } from '@interfaces/index';

/** ADR-0024 P3-INT: `ExportSignals` (ApplicationDB) okuma/yazmaları (dışa aktarım paketinin zamanlama sinyali). */
export class ExportSignalRepository {
    constructor(private readonly db: IApplicationDB) { }

    /** Paket sinyalinin bir sonraki çalışma zamanı (yoksa undefined). */
    async nextRunAt(batchId: unknown): Promise<Date | undefined> {
        const signal = await this.db.getExportSignalModel().findOne({ batchId }).select('nextRunAt').lean();
        return signal?.nextRunAt;
    }
}
