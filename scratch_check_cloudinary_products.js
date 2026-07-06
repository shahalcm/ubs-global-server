const mongoose = require('mongoose');
require('dotenv').config({ path: './.env', override: true });

async function run() {
  console.log('Connecting to database...');
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Database connected!');
    
    const Product = mongoose.model('Product', new mongoose.Schema({
      title: String,
      images: [String],
      category: mongoose.Schema.Types.ObjectId
    }, { collection: 'products' }));

    const products = await Product.find({}).lean();
    console.log(`Total products in database: ${products.length}`);
    
    console.log('--- Cloudinary Products ---');
    const cloudinaryProducts = products.filter(p => p.images && p.images.some(img => img.includes('cloudinary')));
    cloudinaryProducts.forEach((p, idx) => {
      console.log(`Cloudinary Product ${idx + 1}: "${p.title}" (ID: ${p._id})`);
      console.log(`Images:`, p.images);
      console.log('---------------------------------');
    });

    console.log('--- Local Upload Products ---');
    const localProducts = products.filter(p => p.images && p.images.some(img => img.includes('uploads/')));
    localProducts.forEach((p, idx) => {
      console.log(`Local Product ${idx + 1}: "${p.title}" (ID: ${p._id})`);
      console.log(`Images:`, p.images);
      console.log('---------------------------------');
    });

    console.log('--- Unsplash or Other Products ---');
    const otherProducts = products.filter(p => p.images && !p.images.some(img => img.includes('cloudinary') || img.includes('uploads/')));
    console.log(`Found ${otherProducts.length} other products.`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
