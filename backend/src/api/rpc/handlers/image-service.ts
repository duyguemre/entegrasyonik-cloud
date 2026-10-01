import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import { storageService } from '@services/index'
import { imageOperations as ImageOperations } from '@operations/catalog/images/image-operations'
import {
    imageVariantUrl, MAX_PIXELS, productImageKey, publicImageUrl, readImageUploadSettings, sha256Hex, sniffImageType, THUMB_WIDTH,
} from '@services/storage/imagePolicy'
import { ApplicationError } from '@platform/core/security/Security'
import { ProductRepository } from '@database/repositories/tenant/ProductRepository'
import { VariantRepository } from '@database/repositories/tenant/VariantRepository'
import { ImageRepository } from '@database/repositories/tenant/ImageRepository'

/**
 * ADR-0027 §C: doğrudan yüklemeyle eklenen görsel alt belgesi (`products.images[]`, `strict:false` şema).
 * Eski (multipart) görsellerden ayrımı `key` alanıdır: `key` varsa nesne içerik-adreslidir ve silme TAM anahtarla yapılır.
 */
function toDirectImageView(image: any) {
    if (!image || typeof image.key !== 'string') return image
    let thumbUrl = image.url
    try { thumbUrl = imageVariantUrl(image.key, { width: THUMB_WIDTH, format: 'auto' }) } catch { /* kök yoksa orijinal */ }
    return { ...image, thumbUrl }
}

export default class ImageService extends BaseApi implements IService {
    choices: any = undefined
    s3: any

    // getter'lar: test, servisi kurduktan SONRA svc.clientDB atıyor
    private get products() { return new ProductRepository(this.clientDB) }
    private get variants() { return new VariantRepository(this.clientDB) }
    private get images() { return new ImageRepository(this.clientDB) }

    async get(): Promise<any> {
        return await this.images.listOrdered()
    }


    async getImages() {
        var images: any = undefined
        const resp = await this.products.findImagesByTempProductId(this.request.productId)
        if (resp && resp.images) {
            resp.images = resp.images.sort((a: any, b: any) => a.order - b.order) // `order` alanına göre artan sırada
                .map(toDirectImageView); // ADR-0027: `key`'li (doğrudan yüklenen) görsele `thumbUrl`; eskiler AYNEN
        }
        return resp
        return images
    }


    /**
     * ADR-0027 (1): imzalı PUT bileti. Gövde (rpc-input şeması): `{ tempProductId, contentType, size }`.
     * R2'ye istek ATILMAZ (yerel imza). Ürün varlığı burada denetlenmez (taslak ürün görsel yüklemesiyle doğar —
     * eski `addImages` davranışı); tenant sınırı anahtarın `uploads/<clientId>/` önekiyle sunucuda kurulur.
     */
    async createUploadUrl(): Promise<any> {
        const { contentType, size } = this.request
        const settings = readImageUploadSettings()
        if (typeof size !== 'number' || size > settings.maxBytes) {
            throw new ApplicationError(`Görsel en fazla ${settings.maxBytes} bayt olabilir.`, 413, 'IMAGE_TOO_LARGE')
        }
        try {
            return await storageService.createImageUploadTicket(this.currentClientId, contentType, size)
        } catch (e: any) {
            if (/izinli değil|tavan/.test(String(e?.message))) throw new ApplicationError('Görsel türü/boyutu kabul edilmiyor.', 415, 'IMAGE_TYPE_NOT_ALLOWED')
            throw e
        }
    }

    /**
     * ADR-0027 (3): yükleme onayı. Gövde: `{ tempProductId, uploadId, originalname? }`.
     *  - geçici nesne yoksa/süresi dolduysa 404 UPLOAD_NOT_FOUND;
     *  - tavan aşımı 413; gerçek tür (sihirli bayt) izin listesinde değilse 415 — her iki durumda geçici nesne silinir;
     *  - SHA-256 SUNUCUDA hesaplanır → kalıcı anahtar `products/<clientId>/<tempProductId>/<sha256[0:32]>.<ext>`;
     *  - aynı içerik aynı üründe zaten varsa (dedupe) mevcut görsel döner (`deduped: true`), yeni nesne yazılmaz.
     */
    async confirmUpload(): Promise<any> {
        const { tempProductId, uploadId } = this.request
        const originalname = typeof this.request.originalname === 'string' && this.request.originalname ? this.request.originalname : uploadId
        const staged = await storageService.readStagedImage(this.currentClientId, uploadId)
        if (!staged) throw new ApplicationError('Yükleme bulunamadı ya da süresi doldu.', 404, 'UPLOAD_NOT_FOUND')
        const reject = async (msg: string, status: number, code: string): Promise<never> => {
            await storageService.discardStagedImage(this.currentClientId, uploadId)
            throw new ApplicationError(msg, status, code)
        }
        if (staged.tooLarge || !staged.buffer) return await reject('Görsel boyut tavanını aşıyor.', 413, 'IMAGE_TOO_LARGE')
        const buffer = staged.buffer
        const contentType = sniffImageType(buffer)
        if (!contentType) return await reject('Görsel türü kabul edilmiyor (jpeg, png, webp, avif).', 415, 'IMAGE_TYPE_NOT_ALLOWED')

        const meta: any = await ImageOperations.getMetadata(buffer)
        const width = Number(meta?.width) || 0
        const height = Number(meta?.height) || 0
        if (meta?.result === false || width * height > MAX_PIXELS) return await reject('Görsel çözümlenemedi ya da çok büyük.', 415, 'IMAGE_INVALID')

        const sha256 = sha256Hex(buffer)
        const key = productImageKey(this.currentClientId, String(tempProductId), sha256, contentType)
        const url = publicImageUrl(key)

        const existing = await this.products.findImagesByTempId(tempProductId)
        const dup = existing?.images?.find((img: any) => img && img.key === key)
        if (dup) {
            await storageService.discardStagedImage(this.currentClientId, uploadId)
            return { image: toDirectImageView(dup), deduped: true }
        }

        await storageService.commitProductImage(this.currentClientId, key, buffer, contentType)
        await storageService.discardStagedImage(this.currentClientId, uploadId)

        let [w, h] = [width, height]
        if (meta?.orientation && meta.orientation >= 5) [w, h] = [h, w]
        const imageDocument: any = {
            _id: new ObjectId(),
            order: Array.isArray(existing?.images) ? existing.images.length : 0,
            originalname: String(originalname).slice(0, 255),
            isTempImage: false,
            width: w, height: h,
            size: buffer.length,
            extension: key.slice(key.lastIndexOf('.') + 1),
            url, key, contentType, sha256,
        }
        await this.products.pushDirectImage(tempProductId, imageDocument)
        return { image: toDirectImageView(imageDocument), deduped: false }
    }

    async deleteImage(): Promise<any> {
        if (this.request.imageId == undefined || this.request.tempProductId == undefined) throw Error("no imageId or productId for delete")
        const product = await this.products.findForImageDelete(this.request.tempProductId, this.request.imageId)
        if (!product) return false
        var image: any = undefined
        var productId: any = product.tempId
        for (const dbimage of product.images) {
            if (dbimage._id == this.request.imageId) {
                image = dbimage
                break
            }
        }

        await this.products.pullImage(productId, image._id)

        if (image && productId && typeof image.key === 'string') {
            // ADR-0027: doğrudan yüklenen görsel — TAM anahtarla sil (tenant öneki StorageService'te denetlenir).
            await storageService.deleteProductImageKey(this.currentClientId, image.key)
        } else if (image && productId) {
            var directory = ImageOperations.imageFilesPath
            if (!image.transferFromPlatformId) {
                await storageService.deleteFile(this.currentClientId, 'image', image._id, directory + this.currentClientId + '/' + productId, image.extension)
                await storageService.deleteFile(this.currentClientId, 'image', image._id + '_t', directory + this.currentClientId + '/' + productId, image.extension)
            }
        }

        await this.variants.pullImageUrl(product.maincode, image.url)
        return true
    }



    async deleteImages(): Promise<any> {
        if (this.request.selectedImages == undefined) throw Error("no imageIds for delete")
        const product = await this.products.findForImagesDelete(this.request.tempProductId)
        if (!product) return false
        const productId = product.tempId

        const imageIds: Array<any> = []
        const imageUrls: Array<any> = []
        const directKeys = new Map<string, string>()
        for (const selectedImage of this.request.selectedImages) {
            const image = product.images.find((image: any) => image._id == selectedImage)
            imageIds.push(image._id)
            imageUrls.push(image.url)
            if (typeof image.key === 'string') directKeys.set(String(selectedImage), image.key)
        }

        await this.products.pullImages(productId, imageIds)

        await this.variants.pullImageUrls(product.maincode, imageUrls)

        var directory = ImageOperations.imageFilesPath
        for (const selectedImage of this.request.selectedImages) {
            const directKey = directKeys.get(String(selectedImage))
            if (directKey) await storageService.deleteProductImageKey(this.currentClientId, directKey)
            else if (!selectedImage.transferFromPlatformId)
                await storageService.deleteFolder(this.currentClientId, 'image', directory + this.currentClientId + '/' + productId, selectedImage)
        }
        return true
    }


    async sortImages(): Promise<any> {
        var order = 0
        var updates = []
        for (var imageId of this.request.sortedImageIds) {
            updates.push({
                updateOne: {
                    filter: { tempId: this.request.tempProductId, 'images._id': imageId },
                    update: { $set: { 'images.$.order': order++ } }
                }
            },)
        }
        await this.products.bulkWriteImageOrder(updates)
        return true
    }



    async addImages(): Promise<any> {
        var productId: string = this.request.uploadImageForm.tempProductId
        var directory = this.currentClientId + '/' + productId
        const { imageDocuments, imageUploads } = await ImageOperations.prepareImageQueries(directory, this.request.files)
        var resp: any = undefined
        try {
            resp = await this.products.pushImages(productId, imageDocuments)
        } catch (e) {
            console.error(" images update error:", e);
        }
        if (resp) {
            const uploadPromises = imageUploads.map(async (imageUpload: any) => {
                try {
                    const insertedDoc = imageDocuments.find((doc: any) => doc.originalname != undefined && doc.originalname == imageUpload.originalname)
                    if (insertedDoc) {
                        imageUpload.image.fileName = insertedDoc._id.toString()
                        imageUpload.thumbnail.fileName = insertedDoc._id + '_t'
                        await storageService.uploadImage(this.currentClientId, imageUpload.image)
                        await storageService.uploadImage(this.currentClientId, imageUpload.thumbnail)
                    }
                    return true
                } catch (error: any) {
                    console.log(error)
                    return
                }
            });
            await Promise.all(uploadPromises);
            return resp.images
        }
        return false
    }


    async assignImages(): Promise<any> {
        const productId = this.request.productId
        const product = await this.products.findByIdLean(productId);

        // Yeni images array'ini güncellemek için variants'ları işle
        const updatedVariants = product.variants.map((variant: any) => {
            // Variant'ın içindeki choices array'ini kontrol et
            const hasMatchingChoice = variant.choices.some((choice: any) => {
                return (
                    choice.choiceId === this.request.selectedChoice.choiceId &&
                    choice.choiceValueId === this.request.selectedChoice.choiceValueId
                );
            });

            // Eğer matching choice varsa, unique bir şekilde images array'ine ekle
            if (hasMatchingChoice) {
                if (!variant.images) {
                    variant.images = [];
                }

                // Unique kontrol ile selectedImages içindeki her imageId'yi ekle
                this.request.selectedImages.forEach((imageId: any) => {
                    if (!variant.images.includes(imageId)) {
                        variant.images.push(imageId);
                    }
                });
            }

            return variant;
        })

        // Güncellenmiş variants array'ini veritabanına geri yaz
        const resp = await this.products.setVariants(productId, updatedVariants)

        return resp


    }

}