const mongoose = require('mongoose');

const rolesSchema = new mongoose.Schema({
    name : { type: String, required: true },
    privileges: {
        type: [String],
        required: true,
        default: ['default']
    }
},{
    collection: 'roles_tb',
    timestamps: true
})
module.exports = mongoose.model('roles', rolesSchema)