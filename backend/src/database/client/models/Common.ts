import mongoose from "mongoose";

export const HashtagSchema = new mongoose.Schema({
    title: { type: String, required: true },
    color: { type: String },
    values: [
        {
            title: { type: String },
            color: { type: String }
        }
    ]
}, {
    collection: 'Hashtags',
    strict: false
});

export const FavoriteSchema = new mongoose.Schema({
    code: { type: String, required: true },
    order: { type: Number, required: true },

}, {
    collection: 'Favorites',
    strict: false
});


export const CounterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    sequence_value: { type: Number, default: 0 }
}, {
    collection: 'Counters',
    strict: false
});
