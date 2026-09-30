import { InvalidatesTenantCache } from '@utils/decorator/cache'
import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import { detachChoiceFromMappings, pullValueFromMappings } from '@operations/catalog/mapping/mappingCleanup'

export default class ChoiceService extends BaseApi implements IService {
    async get(): Promise<any> {
        try {
            const filterQuery = {}
            // Opsiyonel sayfalama (yanıt şekli aynı: dizi). Verilmezse tümü döner (FE sözleşmesi).
            let query = this.clientDB.getChoiceModel().find(filterQuery).sort({ order: 1 })
            if (this.request?.skip) query = query.skip(Number(this.request.skip))
            if (this.request?.limit) query = query.limit(Number(this.request.limit))
            const choices = await query.lean()
            for (const choice of choices) {
                choice.values.sort((a: any, b: any) => {
                    const aNum = Number(a.title);
                    const bNum = Number(b.title);
                    if (!isNaN(aNum) && !isNaN(bNum)) {
                        return aNum - bNum;
                    }
                    return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
                })
            }
            return choices
        } catch (error) {
            throw error
        }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')

    @InvalidatesTenantCache('PlatformMappingProvider')
    async addChoice(): Promise<any> {
        try {
            const document = {
                title: this.request.title,
                isVarianter: this.request.isVarianter || false, // Eklendi
                isSlicer: this.request.isSlicer || false        // Eklendi
            }
            const resp = await this.clientDB.getChoiceModel().create(document)
            return { result: resp }
        } catch (error) {
            throw error
        }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async addPreparedChoice(): Promise<any> {
        try {
            const document = this.request.choice
            const resp = await this.clientDB.getChoiceModel().create(document)
            return { result: resp }
        } catch (error) {
            throw error
        }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async updateChoice(): Promise<any> {
        try {
            const updateQuery = { _id: new ObjectId(this.request._id as string) }
            const updateSet = {
                $set: {
                    title: this.request.title,
                    isVarianter: this.request.isVarianter, // Eklendi
                    isSlicer: this.request.isSlicer       // Eklendi
                }
            }
            const resp = await this.clientDB.getChoiceModel().updateOne(updateQuery, updateSet)
            return { result: resp }
        } catch (error) {
            throw error
        }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async removeChoice(): Promise<any> {
        try {
            const deleteQuery = { _id: new ObjectId(this.request._id as string) }
            const resp = await this.clientDB.getChoiceModel().deleteOne(deleteQuery)
            // Yetim referans temizliği (P1-5): silme sonucundan BAĞIMSIZ çalışır (idempotent; yarım kalan silme tekrarında iyileşir).
            const detachedMappings = await detachChoiceFromMappings(this.clientDB.getAttributeMappingModel(), String(this.request._id))
            return { result: resp, detachedMappings }
        } catch (error) {
            throw error
        }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async addChoiceValue(): Promise<any> {
        try {
            const filterQuery = {
                _id: new ObjectId(this.request._id as string),
                "values.title": this.request.title
            };

            const existing = await this.clientDB.getChoiceModel().findOne(filterQuery);

            if (existing) {
                throw new Error(`"${this.request.title}" başlığı zaten mevcut`);
            }

            const pushQuery = {
                $push: {
                    values: {
                        title: this.request.title,
                        allowCustom: this.request.allowCustom || false // Schema'da olduğu için eklendi
                    }
                }
            };

            await this.clientDB.getChoiceModel().updateOne(
                { _id: new ObjectId(this.request._id as string) },
                pushQuery
            );

            return true;
        } catch (error) {
            throw error;
        }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async updateChoiceValue(): Promise<any> {
        try {
            const choiceId = new ObjectId(this.request._id as string);
            const valueId = new ObjectId(this.request.id as string);
            const newTitle = this.request.title;

            const duplicate = await this.clientDB.getChoiceModel().findOne({
                _id: choiceId,
                values: {
                    $elemMatch: {
                        title: newTitle,
                        _id: { $ne: valueId }
                    }
                }
            });

            if (duplicate) {
                throw new Error(`"${newTitle}" başlığı başka bir öğede zaten mevcut`);
            }

            const filterQuery = {
                _id: choiceId,
                "values._id": valueId
            };

            const updateQuery = {
                $set: {
                    "values.$.title": newTitle,
                    "values.$.allowCustom": this.request.allowCustom // Eklendi
                }
            };

            const resp = await this.clientDB.getChoiceModel().updateOne(filterQuery, updateQuery);

            return { result: resp };
        } catch (error) {
            throw error;
        }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async removeChoiceValue(): Promise<any> {
        try {
            const filterQuery = { _id: new ObjectId(this.request._id as string) }
            const updateQuery = { "$pull": { "values": { _id: new ObjectId(this.request.id as string) } } }
            const resp = await this.clientDB.getChoiceModel().updateOne(filterQuery, updateQuery)
            const cleanedMappings = await pullValueFromMappings(this.clientDB.getAttributeMappingModel(), String(this.request.id))
            return { result: resp, cleanedMappings }
        } catch (error) {
            throw error
        }
    }
}