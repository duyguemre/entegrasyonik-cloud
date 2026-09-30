import sharp from 'sharp';
import { ObjectId } from 'mongodb'
import { config } from '@config'


class ImageOperations {
    // [ADR-0031 BE-CFG-1] Tek kaynak: config.images (R2_PUBLIC_URL_IMAGE || eski kök). Sabit alan adı burada TUTULMAZ.
    get BASE_IMAGE_URL(): string { return config.images.productBaseUrl }
    get BASE_CLIENT_URL(): string { return config.images.clientBaseUrl }
    thumbnailWidth = 300
    imageFilesPath = "products/"
    clientFilesPath = "clients/"

    /**
     * [ADR-0013 B3, 2026-09-27] Taslak (tempId) ürün görsellerinin GERÇEKTE yazıldığı tenant'lı R2 dizini.
     * Önceden sabit `imageTempFilesPath = "products/temp/"` idi — hiçbir yükleme yolu bu dizini kullanmıyordu
     * (BACKLOG "R2 isimlendirme incelemesi", 2026-09-27): gerçek yükleme (`ImageService.addImages`) zaten
     * `products/<clientId>/<tempId>/…` altına yazıyor (bkz. `image-service.ts:180`, `prepareImageQueries` +
     * `imageFilesPath`). Bu metot artık o gerçek yolu üretir; `ProductService.copyTempImages` kaynak dizini
     * için kullanır.
     */
    public imageTempFilesPath(clientId: string | number, tempId: string): string {
        return this.imageFilesPath + clientId + '/' + tempId;
    }

    public async getThumbnailBuffer(fileBuffer: any): Promise<any> {
        try {
            sharp.cache(false);
            return await sharp(fileBuffer)
                .resize({ width: this.thumbnailWidth }) // Set the width to 800 pixels and let Sharp calculate the height to maintain aspect ratio
                .toBuffer()

        } catch (error: any) {
            console.log(error)
            return { result: false, error: error.message }
        }
    }


    public async getMetadata(fileBuffer: any): Promise<any> {
        try {
            return await sharp(fileBuffer).metadata();

        } catch (error: any) {
            console.log(error)
            return { result: false, error: error.message }
        }
    }


    private createImageDocument(directory: string, file: any, extension: string, metadata: any) {
        const imageId = new ObjectId()
        const imageDocument: any = {
            _id: imageId,
            url: this.BASE_IMAGE_URL + directory + '/' + imageId + '.' + extension,
        }
        imageDocument.extension = extension
        imageDocument.size = file.size

        var { width, height } = metadata
        if (metadata.orientation && metadata.orientation >= 5) {
            [width, height] = [height, width]; // Swap width and height for orientations 5, 6, 7, and 8
        }
        imageDocument.width = width
        imageDocument.height = height
        imageDocument.originalname = file.originalname
        return imageDocument
    }


    public async prepareImageQueries(directory: string, files: Array<any>): Promise<any> {
        try {
            const imageDocuments: Array<any> = []
            const imageUploads = []
            for (const file of files) {
                if (!Buffer.isBuffer(file.buffer)) {
                    throw new Error('Image File buffer is invalid.');
                }
                const fileExtension = file.originalname.split('.').pop();
                const thumbnailFile = { buffer: await this.getThumbnailBuffer(file.buffer), mimetype: file.mimetype }
                if (!Buffer.isBuffer(file.buffer)) {
                    throw new Error('Thumbnail Image File buffer is invalid.');
                }
                imageUploads.push({
                    originalname: file.originalname,
                    image: {
                        directory: this.imageFilesPath + directory,
                        file: file,
                        fileExtension: fileExtension,
                        fileName: 'NA',
                    },
                    thumbnail: {
                        directory: this.imageFilesPath + directory,
                        file: thumbnailFile,
                        fileExtension: fileExtension,
                        fileName: 'NA'
                    }
                })

                const metadata = await this.getMetadata(file.buffer)
                imageDocuments.push(this.createImageDocument(directory, file, fileExtension, metadata))
            }
            return {
                imageDocuments,
                imageUploads
            }
        } catch (e) {
            throw e
        }
    }
    public async prepareIdentityImage(clientId: string, file: any, fileName: string = 'logo'): Promise<any> {
        try {
            if (!Buffer.isBuffer(file.buffer)) {
                throw new Error('Image File buffer is invalid.');
            }
            const fileExtension = file.originalname.split('.').pop();
            const url = this.BASE_CLIENT_URL + clientId + '/' + fileName + '.' + fileExtension;

            return {
                url,
                imageUpload: {
                    directory: this.clientFilesPath + clientId,
                    file: file,
                    fileExtension: fileExtension,
                    fileName: fileName
                }
            }
        } catch (e) {
            throw e
        }
    }

}

export const imageOperations = new ImageOperations();

/* export default new ImageOperations */