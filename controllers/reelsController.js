const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all reels
exports.getAllReels = async (req, res) => {
  try {
    const reels = await prisma.reel.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.json(reels);
  } catch (error) {
    console.error('Error fetching reels:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a reel
exports.createReel = async (req, res) => {
  try {
    const { youtubeVideoId, title, description, hashtags } = req.body;
    
    // Simple extraction if full url is passed instead of ID
    let videoId = youtubeVideoId;
    if (videoId && videoId.includes('v=')) {
      videoId = videoId.split('v=')[1].split('&')[0];
    } else if (videoId && videoId.includes('youtu.be/')) {
      videoId = videoId.split('youtu.be/')[1].split('?')[0];
    }
    
    // For shorts
    if (videoId && videoId.includes('shorts/')) {
      videoId = videoId.split('shorts/')[1].split('?')[0];
    }

    const reel = await prisma.reel.create({
      data: {
        youtubeVideoId: videoId,
        title,
        description,
        hashtags: hashtags || [],
      },
    });
    require('../services/notificationService').notificationService().event('video_published', reel.id, { video_title: reel.title || 'New video' }, { videoId: reel.id }).catch(() => console.error('Video notification service unavailable'));
    res.status(201).json(reel);
  } catch (error) {
    console.error('Error creating reel:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete a reel
exports.deleteReel = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.reel.delete({
      where: { id },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting reel:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
