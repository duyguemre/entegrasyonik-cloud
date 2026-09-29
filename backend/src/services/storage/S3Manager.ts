import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    CopyObjectCommand,
    ListObjectsV2Command,
    GetObjectCommand
} from '@aws-sdk/client-s3';
import { S3Config } from '@interfaces/index';

/**
 * Veritabanından (ClientSchema) çekilen storage verilerinin tipi
 */


export type UploadObject = {
    file: {
        buffer: Buffer;
        mimetype: string;
    };
    directory: string;
    fileName: string;
    fileExtension: string;
}

export type UploadaArchice = {
    data: any;
    directory: string;
    fileName: string;
}

export type DeleteObject = {
    directory: string;
    fileName: string;
    fileExtension?: string;
}

export type CopyObject = {
    directory: string;
    copyDirectory: string;
    fileName: string;
    fileExtension: string;
}

class S3Manager {
    /**
     * Verilen konfigürasyon ile bir S3Client oluşturur.
     */
    private getS3Client(config: S3Config) {
        return new S3Client({
            region: config.region || 'auto',
            endpoint: config.endpoint,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            }
        });
    }

    /**
     * Resim ve Buffer tabanlı dosyaları yükler
     */
    public async upload(config: S3Config, uploadObject: UploadObject): Promise<any> {
        try {
            const s3 = this.getS3Client(config);
            const key = `${uploadObject.directory}/${uploadObject.fileName}.${uploadObject.fileExtension}`;

            const command = new PutObjectCommand({
                Bucket: config.bucketName,
                Key: key,
                Body: uploadObject.file.buffer,
                ContentType: uploadObject.file.mimetype,
            });

            return await s3.send(command);
        } catch (error: any) {
            console.error("[S3Manager Upload Error]:", error.message);
            return { result: false, error: error.message };
        }
    }

    /**
     * Büyük JSON verilerini/Archiveları yükler
     */
    public async uploadArchive(config: S3Config, uploadArchive: UploadaArchice): Promise<{ result: boolean, key?: string, error?: string }> {
        try {
            const s3 = this.getS3Client(config);
            const key = `${uploadArchive.directory}/${uploadArchive.fileName}.json`;
            const buffer = Buffer.from(JSON.stringify(uploadArchive.data));

            const command = new PutObjectCommand({
                Bucket: config.bucketName,
                Key: key,
                Body: buffer,
                ContentType: 'application/json'
            });

            await s3.send(command);
            return { result: true, key };
        } catch (error: any) {
            console.error("[S3Manager Archive Upload Error]:", error.message);
            return { result: false, error: error.message };
        }
    }

    /**
     * Tekil nesneyi AKIŞ (stream) olarak açar (KVKK dışa aktarma indirmesi; bellekte tamponlanmaz).
     * Nesne yoksa (NoSuchKey/404) `null` döner; diğer hatalar fırlatılır (çağıran 5xx/uygun yanıt üretir).
     */
    public async getObject(config: S3Config, key: string): Promise<{ body: any; contentLength?: number } | null> {
        try {
            const s3 = this.getS3Client(config);
            const out: any = await s3.send(new GetObjectCommand({ Bucket: config.bucketName, Key: key }));
            if (!out || !out.Body) return null;
            return { body: out.Body, contentLength: typeof out.ContentLength === 'number' ? out.ContentLength : undefined };
        } catch (error: any) {
            if (error?.name === 'NoSuchKey' || error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) return null;
            console.error("[S3Manager GetObject Error]:", error?.name || error?.message);
            throw error;
        }
    }

    /**
     * Tekil nesne siler
     */
    public async delete(config: S3Config, deleteObject: DeleteObject): Promise<any> {
        try {
            const s3 = this.getS3Client(config);
            const extension = deleteObject.fileExtension ? `.${deleteObject.fileExtension}` : '';
            const key = `${deleteObject.directory}/${deleteObject.fileName}${extension}`;

            const command = new DeleteObjectCommand({
                Bucket: config.bucketName,
                Key: key
            });
            return await s3.send(command);
        } catch (error: any) {
            console.error("[S3Manager Delete Error]:", error.message);
            return { result: false, error: error.message };
        }
    }

    /**
     * Prefix bazlı çoklu silme yapar
     */
    public async deleteMany(config: S3Config, deleteObject: { directory: string, fileName: string }): Promise<any> {
        try {
            const s3 = this.getS3Client(config);
            const prefix = `${deleteObject.directory}/${deleteObject.fileName}`;

            const listCommand = new ListObjectsV2Command({
                Bucket: config.bucketName,
                Prefix: prefix
            });
            const fileObjects = await s3.send(listCommand);

            if (fileObjects.Contents) {
                for (const file of fileObjects.Contents) {
                    if (file.Key) {
                        await s3.send(new DeleteObjectCommand({
                            Bucket: config.bucketName,
                            Key: file.Key
                        }));
                    }
                }
            }
            return { result: true };
        } catch (error: any) {
            console.error("[S3Manager DeleteMany Error]:", error.message);
            return { result: false, error: error.message };
        }
    }

    /**
     * Nesne kopyalar
     */
    public async copy(config: S3Config, copyObject: CopyObject): Promise<any> {
        try {
            const s3 = this.getS3Client(config);
            const key = `${copyObject.directory}/${copyObject.fileName}.${copyObject.fileExtension}`;

            // AWS SDK formatı gereği CopySource başına slash eklenmelidir: /Bucket/Key
            const copySource = `/${config.bucketName}/${copyObject.copyDirectory}/${copyObject.fileName}.${copyObject.fileExtension}`;

            const command = new CopyObjectCommand({
                Bucket: config.bucketName,
                CopySource: copySource,
                Key: key
            });
            return await s3.send(command);
        } catch (error: any) {
            console.error("[S3Manager Copy Error]:", error.message);
            return { result: false, error: error.message };
        }
    }
}

export default new S3Manager();