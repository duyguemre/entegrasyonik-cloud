import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { CAPABILITIES, CAPABILITY_BY_RPC, findRegistryInvariantViolations, rpcBindingsOf } from '../../../src/capabilities';
import { derivePolicy } from '../../../src/capabilities/derive/policy';
import { OPERATION_POLICY } from '../../../src/api/rpc/operationPolicy';
import { OPERATION_POLICY_SNAPSHOT } from './operationPolicy.snapshot';

// ADR-0019 §3: Parite kapısı v1 (Aşama A). `operation-policy.test.ts` DEĞİŞTİRİLMEDEN yeşil kalır (ayrı dosya, ayrı
// süreç) — bu dosya onu GENİŞLETİR, yerini almaz. P1/P3 hata (mandal); P2 zaten `operation-policy.test.ts` tarafından
// TRANSİTİF olarak zorlanır (bkz. not aşağıda); P4-P9 uyarı modunda (yalnız yetim sayısı mandallı, ADR §3 P6).

const FE_SRC = path.resolve(__dirname, '../../../../frontend/src');
const SCREENS_TS = path.join(FE_SRC, 'navigation/screens.ts');

// ---------------------------------------------------------------------------------------------------------------------
// P1 — Bağ bütünlüğü (hata)
// ---------------------------------------------------------------------------------------------------------------------
describe('P1 — Bağ bütünlüğü', () => {
  it('kayıt-içi değişmezler ihlal edilmedi (tekil id, çift bağlı RPC yok, karışık kademe yok, exposed alan zorunlulukları)', () => {
    expect(findRegistryInvariantViolations()).toEqual([]);
  });

  it('türetilen politika = Aşama A ÖNCESİ politikanın anlık görüntüsü (derin eşitlik; operationPolicy.snapshot.ts)', () => {
    expect(derivePolicy(CAPABILITIES)).toEqual(OPERATION_POLICY_SNAPSHOT);
  });

  it('operationPolicy.ts dışa verdiği OPERATION_POLICY de aynı türetilmiş tabloyla birebir aynı (dışa açık API değişmedi)', () => {
    expect(OPERATION_POLICY).toEqual(OPERATION_POLICY_SNAPSHOT);
  });

  it('CAPABILITY_BY_RPC, kayıttaki her bağı TAM OLARAK bir kez içerir (kayıt boyutu = bağ sayısı)', () => {
    const totalBindings = CAPABILITIES.reduce((n, c) => n + rpcBindingsOf(c).length, 0);
    expect(CAPABILITY_BY_RPC.size).toBe(totalBindings);
  });

  // NOT (P2, FE çağrıları): `tests/characterization/auth/operation-policy.test.ts` DEĞİŞTİRİLMEDİ ve zaten
  // "FE'nin çağırdığı HER operasyon ya kayıttadır (OPERATION_POLICY) ya da bilinen backend-siz listesindedir" testini
  // çalıştırıyor. `OPERATION_POLICY` artık BİREBİR `derivePolicy(CAPABILITIES)`'tir (yukarıdaki test), dolayısıyla o
  // test TRANSİTİF olarak "her FE çağrısı bir yeteneğin bağına çözülür"ü de kanıtlar — ayrı bir FE taraması burada
  // TEKRARLANMADI (aynı AST/regex yardımcılarının burada yeniden yazılması yerine tek kaynağa güvenildi; ADR-0019
  // §3 "Onun AST ve FE tarama yardımcıları yeniden kullanılır" ilkesi böylece kod TEKRARSIZ uygulanmış olur).
});

// ---------------------------------------------------------------------------------------------------------------------
// P3 — MCP kararı (derleyici zaten zorluyor; burada çalışma-anı ikinci doğrulama)
// ---------------------------------------------------------------------------------------------------------------------
describe('P3 — MCP kararı', () => {
  it('her yetenekte tam olarak bir mcp kararı var (exposed XOR notExposed)', () => {
    for (const cap of CAPABILITIES) {
      const hasExposed = !!cap.mcp.exposed;
      const hasNotExposed = !!cap.mcp.notExposed;
      expect([cap.id, hasExposed, hasNotExposed]).toEqual([cap.id, hasExposed, !hasExposed]);
    }
  });

  it('notExposed.note >= 20 karakter; reason="deferred" ise until zorunlu', () => {
    for (const cap of CAPABILITIES) {
      if (cap.mcp.notExposed) {
        expect([cap.id, cap.mcp.notExposed.note.length >= 20]).toEqual([cap.id, true]);
        if (cap.mcp.notExposed.reason === 'deferred') expect([cap.id, cap.mcp.notExposed.until]).not.toEqual([cap.id, undefined]);
      }
    }
  });

  // ADR-0034 BR-2: Aşama A'daki "hiçbiri exposed değil" kuralı yerini AÇIK, dondurulmuş bir listeye bıraktı (core 5 + ilk onaylı yazma).
  // Yeni bir yeteneği exposed yapmak bu listeyi ve docs/CAPABILITIES.md'yi bilinçli olarak güncellemeyi gerektirir (mandal).
  // PRC-R0/R1 (2026-10-01, K20/K57): `catalog` toolset'inde maliyet okuma/yazma (onay kartı), buybox listesi, kâr önizlemesi.
  it('exposed yetenek kümesi = dondurulmuş liste (core 5 + orders.approve + pricing 4); yeni exposed bilinçli karar ister', () => {
    const exposed = CAPABILITIES.filter((c) => c.mcp.exposed).map((c) => c.id).sort();
    expect(exposed).toEqual(['integrations.health.get', 'orders.approve', 'orders.list', 'pricing.buybox.list', 'pricing.cost.list', 'pricing.cost.set', 'pricing.margin.preview', 'products.search', 'reports.sales.summary', 'stock.low_list']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// P4 — UI kararı (v1: uyarı; `screens.ts` P1 alt kümesi olduğundan çoğu anahtar bulunamaz, bu BEKLENEN)
// ---------------------------------------------------------------------------------------------------------------------
describe('P4 — UI kararı (uyarı modu)', () => {
  it('her yetenekte bir ui kararı var (screens[] XOR none.reason); screens.ts\'te bulunmayan anahtarlar sayılır (uyarı, kırmızı DEĞİL)', () => {
    const screensSrc = fs.readFileSync(SCREENS_TS, 'utf8');
    const registeredKeys = new Set([...screensSrc.matchAll(/key:\s*'([^']+)'/g)].map((m) => m[1]));
    let notInScreensTs = 0;
    for (const cap of CAPABILITIES) {
      if (cap.ui.screens) {
        expect(cap.ui.screens.length).toBeGreaterThan(0);
        for (const s of cap.ui.screens) {
          const isShell = s.screen.startsWith('shell:');
          if (!isShell && !registeredKeys.has(s.screen)) notInScreensTs++;
        }
      } else {
        expect(cap.ui.none!.reason.length).toBeGreaterThan(0);
      }
    }
    // v1 uyarı: screens.ts yalnızca P1 alt kümesini kayıtlı tutar (ADR-0011 Karar 2); geri kalan ekran/kabuk
    // anahtarları menuStore.views'ta olabilir ama bu testin kapsamı dışıdır. Sayı yalnızca bilgi amaçlı loglanır.
    if (notInScreensTs > 0) console.warn(`[P4 uyarı] screens.ts'te bulunamayan ekran anahtarı sayısı: ${notInScreensTs}`);
    expect(notInScreensTs).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// P6 — Yetim yetenek mandalı (artamaz)
// ---------------------------------------------------------------------------------------------------------------------
const BASELINE_PATH = path.resolve(__dirname, '../../../src/capabilities/capability-baseline.json');

function computeMetrics() {
  const orphanCount = CAPABILITIES.filter((c) => !!c.ui.none && !!c.mcp.notExposed && !c.agent.allowed).length;
  const deferredCount = CAPABILITIES.filter((c) => c.mcp.notExposed?.reason === 'deferred').length;
  const notExposedCount = CAPABILITIES.filter((c) => !!c.mcp.notExposed).length;
  return { totalCapabilities: CAPABILITIES.length, orphanCount, deferredCount, notExposedCount };
}

describe('P6 — Yetim yetenek mandalı (uyarı sayaç + artamaz mandal)', () => {
  it('capability-baseline.json güncel değerleri tutar; mevcut metrikler baseline\'ı AŞMAZ (yalnız düşüş serbest)', () => {
    const baseline: Record<string, number> = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    const current: Record<string, number> = computeMetrics();
    for (const key of Object.keys(baseline)) {
      expect([key, current[key]]).toEqual([key, expect.any(Number)]);
      expect(current[key]).toBeLessThanOrEqual(baseline[key]);
    }
  });
});
