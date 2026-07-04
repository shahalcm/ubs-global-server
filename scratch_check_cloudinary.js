const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: './.env', override: true });

console.log('Checking Cloudinary environment variables...');
console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
console.log('API Key:', process.env.CLOUDINARY_API_KEY);
console.log('Has API Secret:', !!process.env.CLOUDINARY_API_SECRET);
console.log('Has CLOUDINARY_URL:', !!process.env.CLOUDINARY_URL);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function testUpload() {
  console.log('Testing image upload to Cloudinary...');
  try {
    // Try uploading a small 1x1 transparent pixel base64 image as a test
    const result = await cloudinary.uploader.upload(
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      {
        folder: 'ubsglobal/test',
        public_id: 'test_upload_connection'
      }
    );
    console.log('🎉 Cloudinary Upload SUCCESSFUL!');
    console.log('Uploaded Image URL:', result.secure_url);
  } catch (error) {
    console.error('❌ Cloudinary Upload FAILED with error:');
    console.error(error);
  }
}

testUpload();
