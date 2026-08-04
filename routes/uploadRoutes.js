const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadToCloudinary } = require('../utils/cloudinary');
const { uploadToCatbox } = require('../utils/catbox');

// Multer memory storage configuration (handles single file upload into Buffer)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, GIF, WEBP, SVG) are allowed!'), false);
    }
  },
});

// POST /api/upload - Upload image file with multi-tier fallback (Cloudinary -> Catbox -> Data URI)
router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Tier 1: Try Cloudinary if environment variables exist
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      try {
        const folder = req.body.folder || 'valikatti_uploads';
        const result = await uploadToCloudinary(req.file.buffer, folder);

        return res.json({
          url: result.secure_url,
          public_id: result.public_id,
          format: result.format,
          width: result.width,
          height: result.height,
        });
      } catch (cloudinaryError) {
        console.warn('⚠️ Cloudinary upload failed (403/Forbidden/Invalid credentials), falling back to Catbox:', cloudinaryError.message || cloudinaryError);
      }
    }

    // Tier 2: Save to local uploads disk directory
    try {
      const path = require('path');
      const fs = require('fs');
      const uploadsDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const ext = path.extname(req.file.originalname) || '.png';
      const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
      const filepath = path.join(uploadsDir, filename);

      fs.writeFileSync(filepath, req.file.buffer);

      const rawProto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      const protocol = isHttps ? 'https' : (rawProto === 'https' ? 'https' : 'http');
      const fileUrl = `${protocol}://${host}/uploads/${filename}`;

      console.log('✅ Uploaded to local disk:', fileUrl);
      return res.json({
        url: fileUrl,
        filename: filename,
        provider: 'local',
      });
    } catch (localError) {
      console.warn('⚠️ Local disk upload failed, falling back to Catbox:', localError.message || localError);
    }

    // Tier 3: Fallback to Catbox public upload service (reliable direct image URL)
    try {
      const catboxUrl = await uploadToCatbox(req.file.buffer, req.file.originalname, req.file.mimetype);
      console.log('✅ Uploaded to Catbox fallback:', catboxUrl);
      return res.json({
        url: catboxUrl,
        provider: 'catbox',
      });
    } catch (catboxError) {
      console.warn('⚠️ Catbox fallback failed, using Data URI fallback:', catboxError.message || catboxError);
    }

    // Tier 4: Convert buffer to base64 Data URI fallback
    const base64Data = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${base64Data}`;

    return res.json({
      url: dataUri,
      warning: 'Returned data URI fallback.',
    });
  } catch (error) {
    console.error('Image Upload Error:', error);
    return res.status(500).json({ error: error.message || 'Image upload failed' });
  }
});

module.exports = router;
