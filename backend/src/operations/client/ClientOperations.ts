// domains/client/ClientOperations.ts
import { DatabaseManagerInstance } from "@database/DatabaseManager";

import { IClientOperations, S3Config } from '@interfaces/index';
import { readStorageEnv } from '@services/storage/storageEnv';

export class ClientOperations implements IClientOperations {
    constructor() { }

    /**
     * StorageService veya diğer servislerin kullanması için config sağlar.
     * ADR-0003 B.8 (adım 5): erişim anahtarı/bucket/endpoint ENV'den okunur (R2_*; bkz. services/storage/storageEnv.ts);
     * tenant kaydındaki (eski) image/archive anahtar alanları YOK SAYILIR. `clientId` yalnızca zorunlu kimlik kontrolü içindir
     * (tenant ayrımı nesne öneki ile yapılacak: BACKLOG "R2 anahtar öneki göçü").
     * Önbellek yok: yapılandırma env'den ucuzca okunur ve sır değerini süreç-içi önbellekte tutmak gerekmez.
     */
    public async getStorageConfig(clientId: string, type: 'image' | 'archive'): Promise<S3Config> {
        if (!clientId) {
            throw new Error("ClientOperations: Client ID is required.");
        }
        const { accessKeyId, secretAccessKey, bucketName, endpoint, region } = readStorageEnv(type);
        return { accessKeyId, secretAccessKey, bucketName, endpoint, region };
    }


    async saveNotification(clientId: string, notificationData: any) {
        if (!clientId) {
            throw new Error("ClientOperations: Client ID is required.");
        }

        const clientDB = await DatabaseManagerInstance.getClientDB(Number(clientId));

        if (clientDB) {
            await clientDB.getNotificationModel().create(notificationData);
        }
    }


}