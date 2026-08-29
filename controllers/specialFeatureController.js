const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all special features
const getSpecialFeatures = async (req, res) => {
  try {
    const features = await prisma.specialFeature.findMany({
      orderBy: { order: 'asc' }
    });
    res.json(features);
  } catch (error) {
    console.error('Error fetching special features:', error);
    res.status(500).json({ error: 'Failed to fetch special features' });
  }
};

// Create a new special feature
const createSpecialFeature = async (req, res) => {
  try {
    const { titleTa, titleEn, subtitleTa, subtitleEn, bgColor, textColor, isIcon, screen, order, isEnabled } = req.body;
    let imageUrl = null;
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const feature = await prisma.specialFeature.create({
      data: {
        titleTa,
        titleEn,
        subtitleTa,
        subtitleEn,
        bgColor: bgColor || '#FFFFFF',
        textColor: textColor || '#000000',
        isIcon: isIcon === 'true' || isIcon === true,
        screen,
        order: order ? parseInt(order) : 0,
        isEnabled: isEnabled === 'true' || isEnabled === true,
        imageUrl,
      },
    });
    res.status(201).json(feature);
  } catch (error) {
    console.error('Error creating special feature:', error);
    res.status(500).json({ error: 'Failed to create special feature' });
  }
};

// Update an existing special feature
const updateSpecialFeature = async (req, res) => {
  try {
    const { id } = req.params;
    const { titleTa, titleEn, subtitleTa, subtitleEn, bgColor, textColor, isIcon, screen, order, isEnabled } = req.body;
    
    let updateData = {
      titleTa,
      titleEn,
      subtitleTa,
      subtitleEn,
      bgColor,
      textColor,
      isIcon: isIcon === 'true' || isIcon === true,
      screen,
      order: order ? parseInt(order) : 0,
      isEnabled: isEnabled === 'true' || isEnabled === true,
    };

    if (req.file) {
      updateData.imageUrl = `/uploads/${req.file.filename}`;
    }

    const feature = await prisma.specialFeature.update({
      where: { id },
      data: updateData,
    });
    res.json(feature);
  } catch (error) {
    console.error('Error updating special feature:', error);
    res.status(500).json({ error: 'Failed to update special feature' });
  }
};

// Delete a special feature
const deleteSpecialFeature = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.specialFeature.delete({
      where: { id },
    });
    res.json({ message: 'Special feature deleted successfully' });
  } catch (error) {
    console.error('Error deleting special feature:', error);
    res.status(500).json({ error: 'Failed to delete special feature' });
  }
};

module.exports = {
  getSpecialFeatures,
  createSpecialFeature,
  updateSpecialFeature,
  deleteSpecialFeature,
};
