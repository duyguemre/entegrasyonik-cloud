// src/integration/adapters/PlatformMappingProvider.ts

import { IIntegrationEngineProvider } from "./IIntegrationEngineProvider";
import { IApplicationDB, IClientDB } from "@interfaces/index";
import { StatsOperations } from "@operations/client/StatsOperations";
import { QueryBuilderOperations } from "@operations/integration/QueryBuilderOperations";

export class IntegrationEngineProvider implements IIntegrationEngineProvider {
    private statsOperations: StatsOperations;
    constructor(
        private applicationDB: IApplicationDB,
        private clientDB: IClientDB
    ) {

        this.statsOperations = new StatsOperations(this.clientDB);

    }

    getExportFlagModel() {
        return this.applicationDB.getExportFlagModel();
    }

    getExportSignalModel() {
        return this.applicationDB.getExportSignalModel();
    }

    getImportJobModel() {
        return this.applicationDB.getImportJobModel();
    }


    getExportStagedProductModel() {
        return this.clientDB.getExportStagedProductModel();
    }

    getImportStagedProductModel() {
        return this.clientDB.getImportStagedProductModel();
    }


    getImportStagedProductSummaryModel() {
        return this.clientDB.getImportStagedProductSummaryModel();
    }

    getImportJobReportModel() {
        return this.clientDB.getImportJobReportModel();
    }

    getVariantModel() {
        return this.clientDB.getVariantModel();
    }

    getProductModel() {
        return this.clientDB.getProductModel();
    }

    getAttributeMappingModel() {
        return this.clientDB.getAttributeMappingModel();
    }


    prepareVariantPlatformUpdateOp(barcode: string, mapping: Record<string, any> | undefined, integrationCode: string, mode: string, status: string, data?: any) {
        return QueryBuilderOperations.prepareVariantPlatformUpdateOp(barcode, mapping, integrationCode, mode, status, data);
    }

    prepareStagingUpdateOp(id: string, workerName: string, status: string, data: any) {
        return QueryBuilderOperations.prepareStagingUpdateOp(id, workerName, status, data);
    }

    prepareStockSyncConfirmationOp(matchValue: string, integrationCode: string, qty: number, options?: { batchId?: string | null, updatedAt?: Date, matchKey?: string }) {
        return QueryBuilderOperations.prepareStockSyncConfirmationOp(matchValue, integrationCode, qty, options);
    }

    markStatsAsDirty() {
        return this.statsOperations.markStatsAsDirty();
    }

}