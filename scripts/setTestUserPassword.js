const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');

async function setTestUserPassword() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is not set in environment.');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const testPassword = 'Teatuser@123';
    const hashedPassword = await bcrypt.hash(testPassword, 12);

    const query = {
      $or: [
        { phone: '+917777777777' },
        { phone: '917777777777' },
        { phone: '7777777777' },
        { fullPhoneNumber: '+917777777777' },
        { email: 'global@gmail.com' }
      ]
    };

    let user = await User.findOne(query).select('+password');

    if (!user) {
      console.log('ℹ️ Test user not found. Creating test user...');
      user = await User.create({
        name: 'Global Test User',
        email: 'global@gmail.com',
        phone: '+917777777777',
        fullPhoneNumber: '+917777777777',
        phoneNumber: '7777777777',
        phoneCountryCode: '+91',
        countryFlag: '🇮🇳',
        countryCode: 'IN',
        countryName: 'India',
        currencyCode: 'INR',
        currencySymbol: '₹',
        timezone: 'Asia/Kolkata',
        password: hashedPassword,
        isVerified: true,
        role: 'seller'
      });
      console.log('✅ Created test user:', user._id);
    } else {
      user.password = hashedPassword;
      user.fullPhoneNumber = '+917777777777';
      user.phoneNumber = '7777777777';
      user.phoneCountryCode = '+91';
      user.isVerified = true;
      await user.save();
      console.log('✅ Updated test user password for:', user.phone, `(${user._id})`);
    }

    // Verify
    const updatedUser = await User.findById(user._id).select('+password');
    const isMatchTeat = await bcrypt.compare('Teatuser@123', updatedUser.password);
    console.log('🔑 Password verification test (Teatuser@123):', isMatchTeat ? 'SUCCESS ✅' : 'FAILED ❌');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting test user password:', error);
    process.exit(1);
  }
}

setTestUserPassword();
