import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'

export default class ChoiceService extends BaseApi implements IService {
    async get(): Promise<any> {
        try {
            const filterQuery = {}
            const choices = await this.clientDB.getChoiceModel().find(filterQuery).sort({ order: 1 }).lean()
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

    async saveIntegration(): Promise<any> {
        try {
            const filter = { _id: new ObjectId(this.request.choiceId) }
            const key = this.request.integrationCategoryId + '_' + this.request.integrationChoiceId
            const path = 'platforms.' + this.request.integrationCode + '.' + key
            const updateSet = { $set: { [path]: this.request.mapping } }
            const resp = await this.clientDB.getChoiceModel().updateOne(filter, updateSet)
            return { result: resp }
        } catch (error) {
            throw error
        }
    }

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

    async addPreparedChoice(): Promise<any> {
        try {
            const document = this.request.choice
            const resp = await this.clientDB.getChoiceModel().create(document)
            return { result: resp }
        } catch (error) {
            throw error
        }
    }

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

    async removeChoice(): Promise<any> {
        try {
            const deleteQuery = { _id: new ObjectId(this.request._id as string) }
            const resp = await this.clientDB.getChoiceModel().deleteOne(deleteQuery)
            return { result: resp }
        } catch (error) {
            throw error
        }
    }

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

    async removeChoiceValue(): Promise<any> {
        try {
            const filterQuery = { _id: new ObjectId(this.request._id as string) }
            const updateQuery = { "$pull": { "values": { _id: new ObjectId(this.request.id as string) } } }
            const resp = await this.clientDB.getChoiceModel().updateOne(filterQuery, updateQuery)
            return { result: resp }
        } catch (error) {
            throw error
        }
    }
}