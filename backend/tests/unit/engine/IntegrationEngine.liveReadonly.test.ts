// LIVE-RO Katman B: LIVE_READONLY=1 iken yazan orkestratörler (Export hattı, sipariş çekimi/BullMQ) BAŞLATILMAZ; yalnız Import çalışır. DB/Redis/ağ YOK.
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn() } }));
jest.mock('@integration/engine/catalog/export/ExportOrchestrator', () => ({ ExportOrchestrator: { start: jest.fn(), clearZombies: jest.fn(async () => undefined) } }));
jest.mock('@integration/engine/catalog/import/ImportOrchestrator', () => ({ ImportOrchestrator: { start: jest.fn(), clearZombies: jest.fn(async () => undefined) } }));
jest.mock('@integration/engine/order/OrderOrchestrator', () => ({ OrderOrchestrator: { start: jest.fn() } }));

let Engine: any; let Export: any; let Import: any; let Order: any;
const prev = process.env.LIVE_READONLY;
function loadFresh() {
  jest.resetModules();
  Engine = require('@integration/engine/IntegrationEngine').default;
  const { DatabaseManagerInstance } = require('@database/DatabaseManager');
  DatabaseManagerInstance.getApplicationDB.mockReset().mockResolvedValue({});
  ({ ExportOrchestrator: Export } = require('@integration/engine/catalog/export/ExportOrchestrator'));
  ({ ImportOrchestrator: Import } = require('@integration/engine/catalog/import/ImportOrchestrator'));
  ({ OrderOrchestrator: Order } = require('@integration/engine/order/OrderOrchestrator'));
}
beforeEach(() => {
  jest.spyOn(global, 'setInterval').mockImplementation((() => 0) as any);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { if (prev === undefined) delete process.env.LIVE_READONLY; else process.env.LIVE_READONLY = prev; jest.restoreAllMocks(); });

describe('IntegrationEngine.start x LIVE_READONLY', () => {
  it('kip AÇIK: Export ve Order orkestratörleri ÇAĞRILMAZ, Import çağrılır', async () => {
    process.env.LIVE_READONLY = 'true';
    loadFresh();
    await Engine.start();
    expect(Import.start).toHaveBeenCalledTimes(1);
    expect(Export.start).not.toHaveBeenCalled();
    expect(Order.start).not.toHaveBeenCalled();
  });
  it('kip KAPALI: üç orkestratör de başlar (davranış değişmez)', async () => {
    delete process.env.LIVE_READONLY;
    loadFresh();
    await Engine.start();
    expect(Export.start).toHaveBeenCalledTimes(1);
    expect(Import.start).toHaveBeenCalledTimes(1);
    expect(Order.start).toHaveBeenCalledTimes(1);
  });
});
