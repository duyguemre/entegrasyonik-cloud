// Tenant DB adı izin kapısı (CLAUDE.md kural 2 + ADR-0003/0024): yalnız bilinen tenant adları ve provisioning kalıbı
// `entegrasyonikClient_<n>` geçer; genel `entegrasyonik*` öneki bilinçli olarak kabul edilmez.
import { describe, it, expect } from '@jest/globals';
import { isAllowedTenantDbName } from '@database/tenantConnection';

describe('isAllowedTenantDbName', () => {
  it.each([
    'entegrasyonik',
    'entegrasyonik_client',
    'entegrasyonik_client_2',
    'entegrasyonik_client_24',
    'entegrasyonik_client_25',
    'entegrasyonikClient_1',
    'entegrasyonikClient_7',
    'entegrasyonikClient_1024',
  ])('kabul: %s', (name) => {
    expect(isAllowedTenantDbName(name, 'entegrasyonikDB')).toBe(true);
  });

  it.each([
    'entegrasyonikDB', // uygulama DB'si tenant olamaz
    'entegrasyonik_test', // önek tutsa da bilinen/kalıp değil
    'entegrasyonik_client_3', // izinli listede yok
    'entegrasyonikClient_0',
    'entegrasyonikClient_01',
    'entegrasyonikClient_x',
    'entegrasyonikClient_',
    'admin',
    'local',
    'baskaProje',
    '',
    undefined,
    null,
    42,
  ])('red: %p', (name) => {
    expect(isAllowedTenantDbName(name as unknown, 'entegrasyonikDB')).toBe(false);
  });

  it('env DB_NAME ile aynı ad tenant olamaz', () => {
    expect(isAllowedTenantDbName('entegrasyonikClient_1', 'entegrasyonikClient_1')).toBe(false);
  });
});
