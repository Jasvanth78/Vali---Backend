const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a buffer directly to Cloudinary
 * @param {Buffer} buffer - File buffer
 * @param {String} folder - Cloudinary folder path
 * @returns {Promise<Object>} Upload result object
 */
const uploadToCloudinary = (buffer, folder = 'valikatti') => {
  return new Promise((resolve, reject) => {
    // If Cloudinary credentials are not configured, log warning & return mock or reject
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.warn('⚠️ Cloudinary environment variables missing (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)');
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
};

module.exports = {
  cloudinary,
  uploadToCloudinary,
};
