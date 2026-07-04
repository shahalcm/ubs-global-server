const mongoose = require('mongoose');
require('dotenv').config({ path: './.env', override: true });

async function run() {
  console.log('Connecting to database...');
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Database connected successfully!');
    
    const Product = mongoose.model('Product', new mongoose.Schema({
      title: String,
      images: [String],
      category: mongoose.Schema.Types.ObjectId
    }, { collection: 'products' }));

    const products = await Product.find({}).limit(5).lean();
    console.log('--- Product Images Inspection ---');
    if (products.length === 0) {
      console.log('No products found in the database.');
    } else {
      products.forEach((p, idx) => {
        console.log(`Product ${idx + 1}: "${p.title}"`);
        console.log(`Images array:`, p.images);
        console.log('---------------------------------');
      });
    }
  } catch (err) {
    console.error('Error connecting or querying:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
}

run();
