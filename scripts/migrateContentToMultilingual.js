const mongoose = require('mongoose');
require('dotenv').config();

const Product = require('../models/Product');
const Category = require('../models/Category');
const Banner = require('../models/Banner');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ubs-global';

async function migrate() {
  try {
    console.log('Connecting to MongoDB:', MONGO_URI);
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB successfully.');

    // 1. Migrate Products
    const products = await Product.find({});
    console.log(`Found ${products.length} products to check/migrate.`);

    let migratedProducts = 0;
    for (const prod of products) {
      let updated = false;
      if (!prod.translations) prod.translations = new Map();

      const enTrans = prod.translations.get('en') || {};
      if (!enTrans.title && prod.title) {
        enTrans.title = prod.title;
        updated = true;
      }
      if (!enTrans.description && prod.description) {
        enTrans.description = prod.description;
        updated = true;
      }
      if (!enTrans.warranty && prod.warranty) {
        enTrans.warranty = prod.warranty;
        updated = true;
      }
      if (!enTrans.brand && prod.brand) {
        enTrans.brand = prod.brand;
        updated = true;
      }

      if (updated) {
        prod.translations.set('en', enTrans);
        await prod.save();
        migratedProducts++;
      }
    }
    console.log(`Successfully migrated ${migratedProducts} products.`);

    // 2. Migrate Categories
    const categories = await Category.find({});
    console.log(`Found ${categories.length} categories to check/migrate.`);

    let migratedCategories = 0;
    for (const cat of categories) {
      let updated = false;
      if (!cat.translations) cat.translations = new Map();

      const enTrans = cat.translations.get('en') || {};
      if (!enTrans.name && cat.name) {
        enTrans.name = cat.name;
        updated = true;
      }
      if (!enTrans.description && cat.description) {
        enTrans.description = cat.description;
        updated = true;
      }

      if (updated) {
        cat.translations.set('en', enTrans);
        await cat.save();
        migratedCategories++;
      }
    }
    console.log(`Successfully migrated ${migratedCategories} categories.`);

    // 3. Migrate Banners
    const banners = await Banner.find({});
    console.log(`Found ${banners.length} banners to check/migrate.`);

    let migratedBanners = 0;
    for (const ban of banners) {
      let updated = false;
      if (!ban.translations) ban.translations = new Map();

      const enTrans = ban.translations.get('en') || {};
      if (!enTrans.title && ban.title) {
        enTrans.title = ban.title;
        updated = true;
      }
      if (!enTrans.subtitle && ban.subtitle) {
        enTrans.subtitle = ban.subtitle;
        updated = true;
      }
      if (!enTrans.buttonText && ban.buttonText) {
        enTrans.buttonText = ban.buttonText;
        updated = true;
      }

      if (updated) {
        ban.translations.set('en', enTrans);
        await ban.save();
        migratedBanners++;
      }
    }
    console.log(`Successfully migrated ${migratedBanners} banners.`);

    console.log('Migration Complete!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
