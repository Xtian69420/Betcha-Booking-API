const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({
    name: {type: String, required: true}
},{
    collection: 'test_tb'
});

module.exports = mongoose.model('test', testSchema)