const featuredProperty = require('../models/featuredPropertyModel');

exports.createFeatured = async (req, res) => {
  try {
    const { propertyId } = req.body;

    if (!propertyId) {
      return res.status(400).json({ message: 'propertyId is required.' });
    }

    const count = await featuredProperty.countDocuments();

    if (count >= 5) {
      return res.status(400).json({ message: 'Maximum of 5 featured properties allowed.' });
    }

    const existing = await featuredProperty.findOne({ propertyId });
    if (existing) {
      return res.status(409).json({ message: 'Property is already featured.' });
    }

    const newFeatured = new featuredProperty({
      propertyId,
      number: count + 1
    });

    await newFeatured.save();

    res.status(201).json({
      message: 'Featured property added successfully.',
      featured: newFeatured
    });

  } catch (error) {
    console.error('Create Featured Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getAllFeatured = async (req, res) => {
  try {
    const featuredList = await featuredProperty.find()
      .sort({ number: 1 }) 
      .populate('propertyId');

    res.status(200).json(featuredList);

  } catch (error) {
    console.error('Get All Featured Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.updateFeaturedById = async (req, res) => {
  try {
    const { id } = req.params;
    const { propertyId } = req.body;

    const updated = await featuredProperty.findByIdAndUpdate(
      id,
      { propertyId },
      { new: true }
    ).populate('propertyId');

    if (!updated) {
      return res.status(404).json({ message: 'Featured property not found.' });
    }

    res.status(200).json({
      message: 'Featured property updated.',
      featured: updated
    });

  } catch (error) {
    console.error('Update Featured Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.deleteFeaturedById = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await featuredProperty.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: 'Featured property not found.' });
    }

    const remaining = await featuredProperty.find().sort({ number: 1 });

    for (let i = 0; i < remaining.length; i++) {
      remaining[i].number = i + 1;
      await remaining[i].save();
    }

    res.status(200).json({ message: 'Featured property deleted and numbers updated.' });

  } catch (error) {
    console.error('Delete Featured Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
