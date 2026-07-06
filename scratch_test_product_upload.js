const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: './.env', override: true });

async function run() {
  console.log('Connecting to database...');
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Database connected!');

    const Product = mongoose.model('Product', new mongoose.Schema({
      title: String,
      images: [String],
      price: Number,
      stock: Number,
      status: String,
      approvalStatus: String
    }, { collection: 'products' }));

    // 1. Verify Cloudinary configuration status
    const { isCloudinaryConfigured } = require('./config/cloudinary');
    console.log('Is Cloudinary configured on backend?:', isCloudinaryConfigured());

    // 2. Perform test upload directly via Cloudinary config
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });

    console.log('Uploading sample image to Cloudinary...');
    const result = await cloudinary.uploader.upload(
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      {
        folder: 'ubsglobal/products',
        public_id: `product_test_${Date.now()}`
      }
    );

    console.log('🎉 Cloudinary Upload SUCCESSFUL!');
    console.log('Result URL:', result.secure_url);

    // 3. Create test product in the database using this Cloudinary URL
    console.log('Saving test product with Cloudinary image to database...');
    const newProduct = await Product.create({
      title: 'Cloudinary Test Mouse',
      images: [result.secure_url],
      price: 15,
      stock: 10,
      status: 'active',
      approvalStatus: 'approved'
    });

    console.log('🎉 Test Product created in database!');
    console.log('Product details:', newProduct);

  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
}

run();
