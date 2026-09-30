// ADR-0024 P1-CORE: gerçek uygulama platform/core/security/Security.ts altına taşındı (operations → api kenarını kapatmak için);
// geriye dönük uyumluluk shim'i. Yeni kod '@platform/core/security/Security' kullanır.
export * from '../platform/core/security/Security';
export { default } from '../platform/core/security/Security';
