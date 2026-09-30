// ADR-0024 P0-LAYER: olay yolu alt katmana (platform/runtime/events) taşındı; bu dosya geriye dönük uyumluluk shim'idir
// (engine/api tüketicileri ve `jest.mock('@integration/engine/IntegrationEventBus')` hedefleri bu yolu kullanır).
export * from '../../platform/runtime/events/IntegrationEventBus';
