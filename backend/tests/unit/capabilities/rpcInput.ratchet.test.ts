import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { CAPABILITIES, CAPABILITY_BY_RPC, RPC_INPUT_BY_RPC, rpcBindingsOf } from '../../../src/capabilities';
import { RPC_INPUT_SCHEMAS } from '../../../src/capabilities/rpc-input';

// [ADR-0023] RPC gövde şeması MANDALI. Yazma etkili (effect != read) bağlardan şemasız olanların listesi DONDURULMUŞTUR:
// yalnızca KÜÇÜLEBİLİR. Yeni bir yazma operasyonu şemasız eklenirse veya şema eklenip liste güncellenmezse test kırılır.
// Yeniden üretim: UPDATE_RPC_INPUT_BASELINE=1 npx jest tests/unit/capabilities/rpcInput.ratchet.test.ts
const BASELINE_FILE = path.join(__dirname, '../../../src/capabilities/rpc-input-baseline.json');

const writeRpcs = (): string[] => CAPABILITIES.filter((c) => c.effect !== 'read').flatMap((c) => rpcBindingsOf(c).map((b) => b.rpc));
const unschematizedWrites = (): string[] => writeRpcs().filter((r) => !RPC_INPUT_BY_RPC.has(r)).sort();

describe('RPC gövde şeması mandalı (ADR-0023)', () => {
  if (process.env.UPDATE_RPC_INPUT_BASELINE === '1') {
    it('taban dosyasını yeniden üretir', () => {
      fs.writeFileSync(BASELINE_FILE, JSON.stringify({ unschematizedWriteRpcs: unschematizedWrites() }, null, 2) + '\n');
    });
    return;
  }
  const baseline: string[] = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')).unschematizedWriteRpcs;

  it('rpc-input kaydındaki her anahtar KAYITLI bir yeteneğin bağıdır (ölü/yazım hatalı şema yok) ve bağa iliştirilmiştir', () => {
    for (const rpc of Object.keys(RPC_INPUT_SCHEMAS)) {
      expect([rpc, CAPABILITY_BY_RPC.has(rpc)]).toEqual([rpc, true]);
      expect([rpc, RPC_INPUT_BY_RPC.has(rpc)]).toEqual([rpc, true]);
    }
  });

  it('ilk dalga: en az 30 YAZMA bağı şemalı', () => {
    const schematized = writeRpcs().filter((r) => RPC_INPUT_BY_RPC.has(r));
    expect(schematized.length).toBeGreaterThanOrEqual(30);
  });

  it('şemasız yazma bağı YENİ eklenemez (taban listesinde olmayan şemasız yazma bağı yok)', () => {
    const extra = unschematizedWrites().filter((r) => !baseline.includes(r));
    expect(extra).toEqual([]);
  });

  it('taban listesi bayat kalamaz: artık şemalı/olmayan bağlar listeden ÇIKARILMALI (mandal yalnız küçülür)', () => {
    const current = new Set(unschematizedWrites());
    expect(baseline.filter((r) => !current.has(r))).toEqual([]);
  });

  it('yüksek riskli kimlik/para/stok/entegrasyon-ayarı yazmaları şemalıdır', () => {
    for (const rpc of [
      'UserService/createUser', 'UserService/updateUser', 'UserService/deleteUser', 'SettingService/updateSettings',
      'BillingService/startCheckout', 'IntegrationService/saveClientMarketplaceSettings', 'IntegrationService/saveClientECommerceSettings',
      'IntegrationService/saveClientErpSettings', 'IntegrationService/saveClientShipmentSettings', 'IntegrationService/saveTenantStockPolicy',
      'IntegrationService/saveChannelStockPolicy', 'OrderService/cancelOrder', 'TicketService/sendTicketMessage', 'AdminService/deleteClient',
    ]) expect([rpc, RPC_INPUT_BY_RPC.has(rpc)]).toEqual([rpc, true]);
  });
});
