// src/integration/common/IPlatformProvider.ts

export interface IIntegrationEngineProvider {
    getExportFlagModel(): any
    getExportSignalModel(): any;
    getExportStagedProductModel(): any;
    getImportStagedProductModel(): any;
    getImportJobModel(): any;
    getImportJobReportModel(): any;
    getImportStagedProductSummaryModel(): any;
    getVariantModel(): any
    getProductModel(): any
    getAttributeMappingModel(): any
    /** [WP12] Tenant kapsamlı, önbellekli eşleme sağlayıcısı (export özellik çözümleyicisi için). */
    getPlatformMappingProvider?(clientId: any, integrationCode: string): any


    prepareVariantPlatformUpdateOp(barcode: string, mapping: Record<string, any> | undefined, integrationCode: string, mode: string, status: string, data?: { messages?: string | string[], batchProcessId?: string | null, updatedAt?: Date, matchKey?: string, issues?: any[] }): any;
    prepareStagingUpdateOp(id: string, workerName: string, status: string, data: any): any;
    /** ADR-0004 Karar 6 (Aşama C) — bkz. `QueryBuilderOperations.prepareStockSyncConfirmationOp`. */
    prepareStockSyncConfirmationOp(matchValue: string, integrationCode: string, qty: number, options?: { batchId?: string | null, updatedAt?: Date, matchKey?: string }): any;
    markStatsAsDirty(): Promise<void>;



}