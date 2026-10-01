import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import { storageService } from '@services/index'
import { imageOperations as ImageOperations } from '@operations/catalog/images/image-operations'
import {
    imageVariantUrl, MAX_PIXELS, productImageKey, publicImageUrl, readImageUploadSettings, sha256Hex, sniffImageType, THUMB_WIDTH,
} from '@services/storage/imagePolicy'
import { ApplicationError } from '@platform/core/security/Security'

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

    async get(): Promise<any> {
        try {
            return await this.clientDB.getImageModel().find({}).sort({ order: 1 }).lean()

            /*             const filterQuery = {}
                        const collectionInstance = this.clientDB.collection('images')
                        const images = await collectionInstance.find(filterQuery).sort({ order: 1 }).toArray()
                        return images */
        } catch (error) {
            throw error
        }
    }


    //TODO BASKA BIR YOL DUSUNULECEK
    async getIntegrations(): Promise<any> {
        try {
            const filterQuery = {}
            const projection = { settings: 0 }
            // [BULGU DÜZELTMESİ, 2026-09-29] `find(filterQuery, { projection })` YANLIŞ sarmalanmıştı — mongoose'un
            // ikinci argümanı DOĞRUDAN alan-seçim nesnesi bekler. Gerçek Mongo'da (mongodb-memory-server ile
            // doğrulandı, bkz. tests/mongo-semantics/integrationProjectionShape.mongoSemantics.test.ts) bu HATA
            // FIRLATMIYORDU, sessizce TÜM alanları (settings dahil) döndürüyordu — B4 gereksiz alan sızıntısı.
            return await this.applicationDB.getIntegrationModel().find(filterQuery, projection)
        } catch (error) {
            throw error
        }
    }

    async getProduct(_id: string): Promise<any> {
        if (_id == undefined) throw Error("no id")
        try {
            const filterQuery = { _id: new ObjectId(_id) }
            let projection = { title: 1, _id: 0 }
            // [BULGU DÜZELTMESİ, 2026-09-29] bkz. getIntegrations() üstündeki not — aynı yanlış sarmalama.
            return await this.clientDB.getProductModel().find(filterQuery, projection)

        } catch (error) {
            throw error
        }
    }

    async getImages() {
        var images: any = undefined
        try {
            const filterQuery: any = { tempId: new ObjectId(this.request.productId + '') }
            const resp = await this.clientDB.getProductModel().findOne(filterQuery).select('_id images').lean()
            if (resp && resp.images) {
                resp.images = resp.images.sort((a: any, b: any) => a.order - b.order) // `order` alanına göre artan sırada
                    .map(toDirectImageView); // ADR-0027: `key`'li (doğrudan yüklenen) görsele `thumbUrl`; eskiler AYNEN
            }
            return resp
        } catch (error) {
            throw error
        }
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

        const existing = await this.clientDB.getProductModel().findOne({ tempId: tempProductId }).select('_id images').lean()
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
        await this.clientDB.getProductModel().updateOne(
            { tempId: tempProductId },
            { $push: { images: imageDocument }, $setOnInsert: { stockcode: String(Date.now()), maincode: tempProductId } },
            { upsert: true },
        )
        return { image: toDirectImageView(imageDocument), deduped: false }
    }

    async deleteImage(): Promise<any> {
        if (this.request.imageId == undefined || this.request.tempProductId == undefined) throw Error("no imageId or productId for delete")
        try {
            const product = await this.clientDB.getProductModel().findOne({ tempId: this.request.tempProductId, 'images._id': this.request.imageId }).select('tempId maincode images').lean()
            if (!product) return false
            var image: any = undefined
            var productId: any = product.tempId
            for (const dbimage of product.images) {
                if (dbimage._id == this.request.imageId) {
                    image = dbimage
                    break
                }
            }

            await this.clientDB.getProductModel().updateOne(
                { tempId: productId },
                {
                    $pull: {
                        images: { _id: image._id },
                    }
                })

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

            await this.clientDB.getVariantModel().updateMany(
                { maincode: product.maincode },
                {
                    $pull: {
                        images: image.url,
                    }
                })
            return true
        } catch (error) {
            throw error
        }
    }



    async deleteImages(): Promise<any> {
        if (this.request.selectedImages == undefined) throw Error("no imageIds for delete")
        try {
            const product = await this.clientDB.getProductModel().findOne({ tempId: this.request.tempProductId }).select('tempId maincode images').lean()
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

            await this.clientDB.getProductModel().updateOne(
                { tempId: productId },
                {
                    $pull: {
                        images: { _id: { $in: imageIds } }
                    }
                })

            await this.clientDB.getVariantModel().updateMany(
                { maincode: product.maincode },
                {
                    $pull: {
                        images: { $in: imageUrls }
                    }
                })

            var directory = ImageOperations.imageFilesPath
            for (const selectedImage of this.request.selectedImages) {
                const directKey = directKeys.get(String(selectedImage))
                if (directKey) await storageService.deleteProductImageKey(this.currentClientId, directKey)
                else if (!selectedImage.transferFromPlatformId)
                    await storageService.deleteFolder(this.currentClientId, 'image', directory + this.currentClientId + '/' + productId, selectedImage)
            }
            return true
        } catch (error) {
            throw error
        }
    }


    async sortImages(): Promise<any> {
        try {
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
            await this.clientDB.getProductModel().bulkWrite(updates)
            return true
        } catch (error) {
            throw error
        }
    }



    async addImages(): Promise<any> {
        try {
            var productId: string = this.request.uploadImageForm.tempProductId
            var directory = this.currentClientId + '/' + productId
            const { imageDocuments, imageUploads } = await ImageOperations.prepareImageQueries(directory, this.request.files)
            var resp: any = undefined
            try {
                resp = await this.clientDB.getProductModel().findOneAndUpdate(
                    { tempId: productId },
                    {
                        stockcode: String(Date.now()),
                        maincode: productId,
                        $push: {
                            images: imageDocuments,
                        },
                    },
                    { new: true, upsert: true } // Güncellenen belgeyi geri döner
                ).lean()
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
        } catch (error) {
            throw error
        }
    }


    async assignImages(): Promise<any> {
        try {
            const productId = this.request.productId
            const product = await this.clientDB.getProductModel().findById(productId).lean();

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
            const resp = await this.clientDB.getProductModel().updateOne(
                { _id: productId },
                { $set: { variants: updatedVariants } }
            )

            return resp


        } catch (error) {
            throw error
        }
    }

}