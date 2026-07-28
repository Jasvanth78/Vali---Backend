const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadToCloudinary } = require('../utils/cloudinary');

// Multer memory storage configuration (handles single/multiple file uploads into Buffer)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, GIF, WEBP, SVG) are allowed!'), false);
    }
  },
});

// POST /api/upload - Upload image file to Cloudinary
router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Check if Cloudinary is configured
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      // Return base64 or temporary URL fallback if Cloudinary is not configured yet
      const base64Data = req.file.buffer.toString('base64');
      const dataUri = `data:${req.file.mimetype};base64,${base64Data}`;
      
      return res.json({
        url: dataUri,
        warning: 'Cloudinary environment variables missing in backend .env. Returned data URI as fallback.',
      });
    }

    const folder = req.body.folder || 'valikatti_uploads';
    const result = await uploadToCloudinary(req.file.buffer, folder);

    res.json({
      url: result.secure_url,
      public_id: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
    });
  } catch (error) {
    console.error('Image Upload Error:', error);
    res.status(500).json({ error: error.message || 'Image upload failed' });
  }
});

module.exports = router;
