const https = require('https');

/**
 * Upload a buffer directly to Catbox.moe (free public file host)
 * @param {Buffer} fileBuffer - File buffer
 * @param {String} originalFilename - Original file name
 * @param {String} mimetype - File MIME type
 * @returns {Promise<string>} Direct image URL
 */
const uploadToCatbox = (fileBuffer, originalFilename = 'image.jpg', mimetype = 'image/jpeg') => {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const filename = originalFilename || 'image.jpg';

    const part1 = `--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n`;
    const part2 = `--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="${filename}"\r\nContent-Type: ${mimetype || 'image/jpeg'}\r\n\r\n`;
    const part3 = `\r\n--${boundary}--\r\n`;

    const buf1 = Buffer.from(part1, 'utf-8');
    const buf2 = Buffer.from(part2, 'utf-8');
    const buf3 = Buffer.from(part3, 'utf-8');
    const totalLength = buf1.length + buf2.length + fileBuffer.length + buf3.length;

    const req = https.request({
      hostname: 'catbox.moe',
      path: '/user/api.php',
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalLength,
      },
      timeout: 20000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const url = data.trim();
        if (url.startsWith('http://') || url.startsWith('https://')) {
          resolve(url);
        } else {
          reject(new Error(`Catbox upload failed: ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Catbox upload timed out'));
    });

    req.write(buf1);
    req.write(buf2);
    req.write(fileBuffer);
    req.write(buf3);
    req.end();
  });
};

module.exports = { uploadToCatbox };
