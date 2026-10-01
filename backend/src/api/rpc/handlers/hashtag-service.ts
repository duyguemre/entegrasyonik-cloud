import { IService } from '@interfaces/index'
import { BaseApi } from '../../BaseApi'
import { ObjectId } from 'mongodb'
export default class HashtagService extends BaseApi implements IService {
    async get(): Promise<any> {
        try {
            const filterQuery = {}
            const hashtags = await this.clientDB.getHashtagModel().find(filterQuery).sort({ title: 1 }).lean()
            for (const hashtag of hashtags) {
                if (hashtag.values) {
                    hashtag.values.sort((a: any, b: any) => {
                        return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
                    })
                }
            }
            return hashtags
        } catch (error) {
            throw error
        }
    }

    async addHashtag(): Promise<any> {
        try {
            const document = {
                title: this.request.title,
                color: this.request.color || '#455a64',
                values: []
            }
            const resp = await this.clientDB.getHashtagModel().create(document)
            return { result: resp }
        } catch (error) {
            throw error
        }
    }

    async updateHashtag(): Promise<any> {
        try {
            const updateQuery = { _id: new ObjectId(this.request._id as string) }
            const updateSet = {
                $set: {
                    title: this.request.title,
                    color: this.request.color
                }
            }
            const resp = await this.clientDB.getHashtagModel().updateOne(updateQuery, updateSet)
            return { result: resp }
        } catch (error) {
            throw error
        }
    }

    async removeHashtag(): Promise<any> {
        try {
            const deleteQuery = { _id: new ObjectId(this.request._id as string) }
            const resp = await this.clientDB.getHashtagModel().deleteOne(deleteQuery)
            return { result: resp }
        } catch (error) {
            throw error
        }
    }

    async addHashtagValue(): Promise<any> {
        try {
            const hashtagId = new ObjectId(this.request._id as string);
            const title = this.request.title;
            const color = this.request.color || '#455a64';

            const filterQuery = {
                _id: hashtagId,
                "values.title": title
            };

            const existing = await this.clientDB.getHashtagModel().findOne(filterQuery);
            if (existing) {
                throw new Error(`"${title}" etiketi zaten mevcut`);
            }

            const pushQuery = {
                $push: {
                    values: {
                        title: title,
                        color: color
                    }
                }
            };

            await this.clientDB.getHashtagModel().updateOne(
                { _id: hashtagId },
                pushQuery
            );

            return true;
        } catch (error) {
            throw error;
        }
    }

    async updateHashtagValue(): Promise<any> {
        try {
            const hashtagId = new ObjectId(this.request._id as string);
            const valueId = new ObjectId(this.request.id as string);
            const newTitle = this.request.title;
            const newColor = this.request.color;

            const filterQuery = {
                _id: hashtagId,
                "values._id": valueId
            };

            const updateQuery = {
                $set: {
                    "values.$.title": newTitle,
                    "values.$.color": newColor
                }
            };

            const resp = await this.clientDB.getHashtagModel().updateOne(filterQuery, updateQuery);
            return { result: resp };
        } catch (error) {
            throw error;
        }
    }

    async removeHashtagValue(): Promise<any> {
        try {
            const hashtagId = new ObjectId(this.request._id as string);
            const valueId = new ObjectId(this.request.id as string);

            const filterQuery = { _id: hashtagId };
            const updateQuery = { "$pull": { "values": { _id: valueId } } };

            const resp = await this.clientDB.getHashtagModel().updateOne(filterQuery, updateQuery);
            return { result: resp };
        } catch (error) {
            throw error;
        }
    }
}
