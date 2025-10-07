const Faq = require('../models/faqModel');
const mongoose = require('mongoose')

exports.createFAQ = async (req, res) => {
    try {
        const { question, answer } = req.body;

        const newFaq = new Faq ({
            question,
            answer,
            active: true
        });

        await newFaq.save();
        res.status(201).json({message: "New FAQ Created", faq: newFaq})

    } catch(error) {
        console.error('Create FAQ Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

exports.updateFAQbyId = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ID format.' });
    }

    if (!updateData || Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No fields provided for update.' });
    }

    const updatedFAQ = await Faq.findByIdAndUpdate(id, { $set: updateData }, { new: true });

    if (!updatedFAQ) {
      return res.status(404).json({ message: "No FAQ found for this ID" });
    }

    res.status(200).json({ message: "FAQ updated successfully!", faq: updatedFAQ });
  } catch (error) {
    console.error('Update FAQ Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteFAQbyId = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid ID format.' });
        }

        const deleted = await Faq.findByIdAndDelete(id);

        if(!deleted) {
            return res.status(404).json({ message: 'FAQ not found' });
        }

        res.status(200).json({message: "FAQ deleted successfully!", Faq: deleted})
    } catch(error) {
        console.error('Delete FAQ Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

exports.getAllFAQ = async (req, res) => {
    try {
        const allFAQ = await Faq.find({ });

        if (allFAQ.length === 0) {
            return res.status(404).json({ message: "There are no active FAQs in the DB" })
        }

        res.status(200).json({message: "Get All Active FAQ success", allFAQ})
    } catch(error) {
        console.error('Get All FAQ Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

exports.get5Faq = async (req, res) => {
  try {
    // Query for FAQs where active is true OR undefined (for backwards compatibility)
    const listFiveFaq = await Faq.find({ 
      $or: [
        { active: true },
        { active: { $exists: false } }
      ]
    }).limit(5); 

    if (!listFiveFaq || listFiveFaq.length === 0) {
      return res.status(404).json({ message: "No Active FAQ Found" });
    }

    res.status(200).json({ message: "Five Active FAQs", Faq: listFiveFaq });
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateActive = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ID format.' });
    }

    const faq = await Faq.findById(id);
    
    if (!faq) {
      return res.status(404).json({ message: 'FAQ not found' });
    }

    faq.active = !faq.active;
    await faq.save();

    res.status(200).json({ 
      message: "FAQ active status updated successfully", 
      active: faq.active 
    });
  } catch (error) {
    console.error('Update FAQ Active Status Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}