/**
 * CHARACTERIZATION: ImportJobs şeması (ADR-0021 D4) — Protokol 13. DB/ağ YOK (validateSync + varsayılan değerler).
 */
import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { ImportJobSchema } from '@database/application/models/Import';

const ImportJobModel = mongoose.model('zz_char_import_job', ImportJobSchema.clone());
const base = { jobId: 'j1', clientId: 1, integrationCode: 'trendyol' };

describe('ImportJobs şeması', () => {
  it('[ADR-0021 2026-09-28 / D4] yeni iş oluşturulurken `archivedAt` OTOMATİK dolmaz (eskiden default Date.now -> her iş "arşivlenmiş" tarihi taşırdı)', () => {
    const job = new ImportJobModel(base);
    expect(job.archivedAt).toBeUndefined();
    expect(job.toObject().archivedAt).toBeUndefined();
  });

  it('[ADR-0021 2026-09-28 / D4] status enum\'unda ARCHIVED var (archiveImportJobs bu değeri yazıyor)', () => {
    expect(new ImportJobModel({ ...base, status: 'ARCHIVED' }).validateSync()).toBeUndefined();
    expect((ImportJobSchema.path('status') as any).enumValues).toContain('ARCHIVED');
  });

  it('diğer durumlar ve varsayılan durum korunur; bilinmeyen durum reddedilir', () => {
    for (const status of ['WAITING_FOR_FETCH', 'FETCHING', 'READY_TO_SYNC', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']) {
      expect(new ImportJobModel({ ...base, status }).validateSync()).toBeUndefined();
    }
    expect(new ImportJobModel(base).status).toBe('WAITING_FOR_FETCH');
    expect(new ImportJobModel({ ...base, status: 'NOPE' }).validateSync()?.errors.status).toBeDefined();
  });

  it('archivedAt açıkça verilirse saklanır (archiveImportJobs $set ile yazar)', () => {
    const d = new Date('2026-09-28T10:00:00Z');
    expect(new ImportJobModel({ ...base, status: 'ARCHIVED', archivedAt: d }).archivedAt).toEqual(d);
  });
});
