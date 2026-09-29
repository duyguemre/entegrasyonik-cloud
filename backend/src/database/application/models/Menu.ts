import mongoose from "mongoose";

export const MenuSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    list: {
        type: [{
            group: { type: String, required: true },
            edit: { type: Boolean, required: false },
            links: {
                type: [{
                    title: { type: String, required: false },
                    icon: { type: String, required: false },
                    code: { type: String, required: false },
                    parent: { type: String, required: false },
                    status: { type: Boolean, required: false },
                    children: {
                        type: [{
                            title: { type: String, required: false },
                            icon: { type: String, required: false },
                            code: { type: String, required: false },
                            parent: { type: String, required: false },
                        }]
                        , required: false
                    }
                }]
                , required: false
            }
        }]
        , required: false
    },
}, {
    collection: 'Menu',
    strict: false
});

