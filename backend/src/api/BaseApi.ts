import { DatabaseManagerInstance } from "@database/DatabaseManager";
import { IApplicationDB, IClientDB } from '@interfaces/index'

export class BaseApi {
    applicationDB!: IApplicationDB
    clientDB!: IClientDB

    constructor(protected clientId: number, protected request: any) {
    }

    protected async initClientDB(clientId: any): Promise<void> {
        if (!clientId) {
            console.warn(`[BaseApi] No clientId provided for initialization. Service: ${this.constructor.name}`);
            return;
        }

        const tempClient = await DatabaseManagerInstance.getClientDB(clientId);
        if (tempClient) {
            this.clientDB = tempClient;
        } else {
            console.error(`[BaseApi] Could not find ClientDB for clientId: ${clientId}`);
        }
    }

    public async init(): Promise<void> {
        try {
            this.applicationDB = await DatabaseManagerInstance.getApplicationDB();
            await this.initClientDB(this.clientId);

            if (!this.clientDB && this.clientId) {
                // Eğer clientId gelmiş ama clientDB kurulamamışsa kritik bir durumdur.
                throw new Error(`Client database connection could not be established for client ID: ${this.clientId}`);
            }
        } catch (e: any) {
            throw e;
        }
    }
}