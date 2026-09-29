import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import { ImageOperations, storageService } from '@services/index'

export default class ImageService extends BaseApi implements IService {
    choices: any = undefined
    s3: any
    currentClientId: any
    constructor(clientId: number, protected request: any) {
        super(clientId, request)
        this.currentClientId = clientId
    }

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
                resp.images = resp.images.sort((a: any, b: any) => a.order - b.order); // `order` alanına göre artan sırada
            }
            return resp
        } catch (error) {
            throw error
        }
        return images
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

            if (image && productId) {
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
            for (const selectedImage of this.request.selectedImages) {
                const image = product.images.find((image: any) => image._id == selectedImage)
                imageIds.push(image._id)
                imageUrls.push(image.url)
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
                if (!selectedImage.transferFromPlatformId)
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