const Test = require('../models/testModels');

exports.createTest = async (req, res) => {
    try {
        const test = new Test({ name: req.body.name });
        const saved = await test.save();
        res.status(201).json(saved);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.getAllTests = async (req, res) => {
    try {
        const tests = await Test.find();
        res.json(tests);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getTestById = async (req, res) => {
    try {
        const test = await Test.findById(req.params.id);
        if (!test) return res.status(404).json({ error: 'Not Found' });
        res.json(test);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateTest = async (req, res) => {
    try {
        const updated = await Test.findByIdAndUpdate(
            req.params.id,
            { name: req.body.name },
            { new: true }
        );
        if (!updated) return res.status(404).json({ error: 'Not Found' });
        res.json(updated);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.deleteTest = async (req, res) => {
    try {
        const deleted = await Test.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Not Found' });
        res.json({ message: 'Deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.run = (req, res) => {
    res.json({ message: 'Server Route Is Working...' });
};

exports.greet = (req, res) => {
    res.json({ message: 'Hi!'});
}