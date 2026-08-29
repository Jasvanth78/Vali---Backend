const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getSpecialFeatures, createSpecialFeature, updateSpecialFeature, deleteSpecialFeature } = require('../controllers/specialFeatureController');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `feature-${Date.now()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage });

router.get('/', getSpecialFeatures);
router.post('/', upload.single('image'), createSpecialFeature);
router.put('/:id', upload.single('image'), updateSpecialFeature);
router.delete('/:id', deleteSpecialFeature);

module.exports = router;
