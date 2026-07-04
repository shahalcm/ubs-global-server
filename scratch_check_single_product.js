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

    const product = await Product.findById('6a102853c7f50cf4be02b059').lean();
    console.log('--- Product ID 6a102853c7f50cf4be02b059 Inspection ---');
    if (!product) {
      console.log('Product not found in the database!');
      // Find any product matching "Mouse"
      const mouseProducts = await Product.find({ title: /Mouse/i }).lean();
      console.log('Mouse products found:', mouseProducts);
    } else {
      console.log(`Product: "${product.title}"`);
      console.log(`Images:`, product.images);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
