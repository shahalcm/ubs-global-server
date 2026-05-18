const mongoose = require('mongoose')
require('dotenv').config()

mongoose.connect(process.env.MONGO_URI)

const seedCategories = async () => {
  const Category = require('./models/Category')
  const categories = [
    { name: 'Fashion', slug: 'fashion' },
    { name: 'Mobiles', slug: 'mobiles' },
    { name: 'Furniture', slug: 'furniture' },
    { name: 'Cosmetics', slug: 'cosmetics' },
    { name: 'Grocery', slug: 'grocery' },
    { name: 'Electronics', slug: 'electronics' },
    { name: 'Medicines', slug: 'medicines' },
    { name: 'Home & Kitchen', slug: 'home-kitchen' },
    { name: 'Job Portal', slug: 'job-portal' },
    { name: 'Service Portal', slug: 'service-portal' },
    { name: 'Real Estate', slug: 'real-estate' },
    { name: 'Building Materials', slug: 'building-materials' },
    { name: 'Machinery', slug: 'machinery' },
    { name: 'Oils', slug: 'oils' },
  ]
  await Category.insertMany(categories)
  console.log('✅ Categories seeded')
  process.exit()
}

seedCategories()