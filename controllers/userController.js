const mongoose = require('mongoose')
const User = require('../models/User')
const Seller = require('../models/Seller')
const Product = require('../models/Product')
const Order = require('../models/Order')
const Review = require('../models/Review')
const GDPRRequest = require('../models/GDPRRequest')
const LegalDoc = require('../models/LegalDoc')
const Notification = require('../models/Notification')

// Get Profile
exports.getProfile = async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Update Profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, email, phone } = req.body
    const user = req.user

    if (name !== undefined) user.name = name.trim()
    
    if (email !== undefined) {
      const emailTrimmed = email.trim().toLowerCase()
      if (emailTrimmed && emailTrimmed !== user.email) {
        // Check if email already in use
        const existing = await User.findOne({ email: emailTrimmed, isDeleted: false })
        if (existing) {
          return res.status(400).json({ success: false, message: 'Email address already in use' })
        }
        user.email = emailTrimmed
      }
    }

    if (phone !== undefined) {
      const phoneTrimmed = phone.trim()
      if (phoneTrimmed && phoneTrimmed !== user.phone) {
        // Check if phone already in use
        const existing = await User.findOne({ phone: phoneTrimmed, isDeleted: false })
        if (existing) {
          return res.status(400).json({ success: false, message: 'Phone number already in use' })
        }
        user.phone = phoneTrimmed
      }
    }

    await user.save()
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Update Avatar
exports.updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an image file' })
    }

    let avatarUrl = req.file.path
    // If not starts with http, it is local upload
    if (avatarUrl && !avatarUrl.startsWith('http')) {
      const host = req.get('host') || '';
      const isLocal = host.includes('localhost') || host.includes('127.0.0.1') || host.includes('192.168.') || host.includes('10.');
      const protocol = isLocal ? req.protocol : 'https';
      avatarUrl = `${protocol}://${host}/uploads/avatars/${req.file.filename}`
    }

    req.user.avatar = avatarUrl
    await req.user.save()

    res.json({
      success: true,
      message: 'Avatar updated successfully',
      user: req.user
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Immediate Soft Account Deletion
exports.deleteAccount = async (req, res) => {
  try {
    const user = req.user

    // Handle Seller Suspension
    const seller = await Seller.findOne({ userId: user._id })
    if (seller) {
      seller.status = 'suspended'
      await seller.save()

      // Set products to inactive
      await Product.updateMany({ sellerId: seller._id }, { status: 'inactive' })
    }

    // Remove tokens & notifications
    user.fcmToken = null
    user.googleId = null
    user.password = null // invalidate password logins
    user.isDeleted = true
    user.deletedAt = new Date()

    // Anonymize details to release unique fields (email & phone) for re-registrations
    user.name = 'Deleted User'
    if (user.email) {
      user.email = `deleted_${user._id}@ubsglobal.deleted`
    }
    if (user.phone) {
      user.phone = `deleted_${user._id}`
    }

    await user.save()

    // Remove notification records associated
    await Notification.deleteMany({ userId: user._id })

    // Log the request
    await GDPRRequest.create({
      userId: user._id,
      requestType: 'delete-account',
      status: 'completed',
      adminNote: 'Self-requested immediate profile deletion (soft deleted)',
      completedAt: new Date()
    })

    res.json({
      success: true,
      message: 'Your account has been deleted successfully.'
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Export All User Data (GDPR Compliant Export)
exports.exportData = async (req, res) => {
  try {
    const user = req.user

    const [seller, reviews, orders] = await Promise.all([
      Seller.findOne({ userId: user._id }),
      Review.find({ userId: user._id }).populate('productId', 'title'),
      Order.find({ buyerId: user._id }).populate('sellerId', 'shopName')
    ])

    const exportData = {
      profile: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
        address: user.address,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      },
      privacySettings: user.privacySettings || {},
      wishlistLength: user.wishlist?.length || 0,
      sellerProfile: seller ? {
        shopName: seller.shopName,
        ownerName: seller.ownerName,
        email: seller.email,
        phone: seller.phone,
        businessType: seller.businessType,
        rating: seller.rating,
        totalSales: seller.totalSales,
        totalRevenue: seller.totalRevenue,
        memberSince: seller.memberSince
      } : null,
      reviews: reviews.map(r => ({
        productTitle: r.productId?.title || 'Unknown Product',
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt
      })),
      orders: orders.map(o => ({
        orderId: o._id,
        sellerShop: o.sellerId?.shopName || 'Unknown Shop',
        items: o.items,
        subTotal: o.subTotal,
        grandTotal: o.grandTotal,
        paymentStatus: o.paymentStatus,
        orderStatus: o.orderStatus,
        createdAt: o.createdAt
      }))
    }

    // Log the request
    await GDPRRequest.create({
      userId: user._id,
      requestType: 'export-data',
      status: 'completed',
      adminNote: 'Self-requested GDPR data export download',
      completedAt: new Date()
    })

    res.json({
      success: true,
      data: exportData
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Request Data Purge (Hard Delete request to GDPR queue)
exports.deleteDataRequest = async (req, res) => {
  try {
    const existing = await GDPRRequest.findOne({
      userId: req.user._id,
      requestType: 'delete-data',
      status: 'pending'
    })

    if (existing) {
      return res.json({
        success: true,
        message: 'A request to delete your personal data has already been submitted and is pending review.',
        request: existing
      })
    }

    const request = await GDPRRequest.create({
      userId: req.user._id,
      requestType: 'delete-data',
      status: 'pending'
    })

    res.json({
      success: true,
      message: 'Your request to delete all personal data has been submitted. An administrator will review and process it shortly.',
      request
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Update Privacy Consent Settings & Logging
exports.updatePrivacySettings = async (req, res) => {
  try {
    const { marketingConsent, dataProcessingConsent } = req.body
    const user = req.user

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || ''
    const userAgent = req.headers['user-agent'] || ''

    if (marketingConsent !== undefined) {
      user.privacySettings.marketingConsent = marketingConsent
      user.consentLogs.push({
        consentType: 'marketingConsent',
        status: marketingConsent,
        ipAddress,
        userAgent,
        timestamp: new Date()
      })
    }

    if (dataProcessingConsent !== undefined) {
      user.privacySettings.dataProcessingConsent = dataProcessingConsent
      user.consentLogs.push({
        consentType: 'dataProcessingConsent',
        status: dataProcessingConsent,
        ipAddress,
        userAgent,
        timestamp: new Date()
      })
    }

    await user.save()

    res.json({
      success: true,
      message: 'Privacy settings updated successfully',
      privacySettings: user.privacySettings
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Public endpoint to fetch dynamic policy documents
exports.getLegalDoc = async (req, res) => {
  try {
    const { key } = req.params
    const doc = await LegalDoc.findOne({ key })
    
    if (!doc) {
      // Returns fallback policies to prevent blank screens if not seeded yet
      let fallbackTitle = ''
      let fallbackContent = 'This policy is currently being updated. Please check back later.'

      if (key === 'privacy-policy') {
        fallbackTitle = 'Privacy Policy'
        fallbackContent = `UBS GLOBAL IMPORTING & EXPORTING - PRIVACY POLICY
Last Updated: June 2025

1. INTRODUCTION
Welcome to UBS Global, a premier multivendor eCommerce mobile application operated by UBS Global Importing & Exporting ("Company", "we", "us", or "our"). This Privacy Policy describes how we collect, store, use, share, and protect your personal information when you access or use our mobile application (the "App") and related services (collectively, the "Services"). The Services include our multi-vendor marketplace, real estate listings, job portal, service hiring portal, and AI chat assistant.

By downloading, registering with, or using the App, you agree to the collection, processing, and disclosure of your personal data as outlined in this Privacy Policy. If you do not agree with any terms of this policy, you must immediately cease all access and use of the App and delete your account.

2. INFORMATION WE COLLECT
To provide a secure and comprehensive marketplace experience, we collect the following categories of information:
• Personal Identification Information: Full name, primary email address, verified phone number, physical shipping and billing addresses, profile photos, and account credentials.
• Precise Location Data: Real-time geographical coordinates of your mobile device. This is used to calculate international shipping fees, local tariffs, applicable taxes, and to filter local real estate, service, or job listings.
• Device and Log Information: Device hardware model, operating system version, unique device identifiers (e.g., IMEI, MAC address, advertising IDs), IP address, mobile network provider, crash reports, and system performance logs.
• Payment Transaction Information: Transaction metadata, order details, and billing history. All payments are processed securely via our payment gateway partner, Razorpay. We do not store raw credit card numbers or sensitive payment credentials on our servers.
• Usage Data and Platform Analytics: Details of your interactions with the App, including search queries, viewed listings, duration of visits, referral sources, and navigation patterns.
• User-Generated Photos and Media: Access to your device's camera and photo library, granted with your permission, to enable uploading photos for product listings, real estate properties, service advertisements, and seller identity verification documents.
• Communication Logs: Peer-to-peer chat messages exchanged between buyers and sellers within the platform (utilizing Socket.io), and user input prompts submitted to our AI chat assistant.

3. HOW WE USE YOUR INFORMATION
We process your personal data under lawful bases (including contract performance, legal compliance, and legitimate interests) for the following purposes:
• Delivering Core Services: To facilitate buyer-seller interactions, order placement, real estate listings, job postings, and service bookings.
• Processing Secure Payments: To transmit transaction details to Razorpay to verify and authorize international payments in USD.
• User Verification: To send secure One-Time Passwords (OTPs) via Twilio to verify phone numbers and maintain account security.
• Personalization: To display customized product recommendations, location-relevant listings, and personalized content.
• AI Chatbot Responses: To analyze chat input data processed by the Anthropic Claude AI framework to deliver intelligent automated assistance and support responses.
• Platform Notifications: To dispatch real-time push alerts regarding order status updates, delivery updates, and inbox notifications.
• Security and Fraud Prevention: To monitor user transactions, analyze device identifiers, prevent chargeback abuse, and audit marketplace listing integrity.
• Regulatory and Legal Compliance: To comply with international export controls, financial audit standards, anti-money laundering (AML) laws, and judicial directives.

4. INFORMATION SHARING AND DISCLOSURE
We do not sell, rent, or trade your personal data with third-party marketers. We share data only as necessary to perform transactions or as legally required:
• Buyer-Seller Sharing: When a buyer completes a purchase, their name, shipping address, and phone number are shared with the seller to facilitate delivery.
• Public Shop Profiles: Seller business details, shop names, locations, and ratings are displayed publicly to all users.
• Third-Party Payment Partners: Order data and payment tokens are shared with Razorpay for secure credit card and local payment processing.
• Core Infrastructure Providers: Data is stored securely on MongoDB Atlas (encrypted database), and media assets (images, certificates) are uploaded to Cloudinary. App servers are hosted securely on Railway.
• Artificial Intelligence Integrations: Chat queries are sent to Anthropic's Claude AI for natural language processing and chatbot support. Submitted messages are anonymized to protect user identity.
• Compliance and Legal Process: We may disclose information if required by law, subpoena, or to protect the safety, rights, or property of the Company, our users, or the public.

5. DATA STORAGE, HOSTING, AND SECURITY
We implement industry-standard security protocols to protect your information:
• Transit Encryption: All network communications between the mobile application and our servers are encrypted using Secure Sockets Layer (SSL) and Transport Layer Security (TLS 1.2/1.3) protocols.
• Database Security: All user records are stored in MongoDB Atlas, utilizing advanced security firewalls, access controls, and encryption-at-rest.
• Media Isolation: Uploaded listing and identity verification photos are stored and served securely by Cloudinary using access-restricted keys.
• Server Hosting: Our backend infrastructure is hosted on Railway in secure container environments with automated security patching and firewall protection.
• Data Retention: Profile and account information are retained as long as your account remains active. Transactional history, billing documents, and compliance records are archived for a legally mandated period (up to 7 years) to satisfy international trade, tax, and corporate audit laws.

6. LOCATION DATA GOVERNANCE
• Purpose: We collect precise location data (both when the app is in the foreground and background) to automate international trade logistics, estimate delivery charges, and filter local listings.
• User Control: You can enable or disable location services at any time through your mobile operating system's settings. Disabling location services may limit the availability of certain geographic-dependent features.
• Consent and Sharing: Your location coordinate data is processed locally or sent to our servers to calculate distances. It is never shared with other users or third parties without your explicit, separate authorization.

7. COOKIES, SESSION TOKENS, AND TRACKING
• Session Management: We use persistent authentication tokens and device-based local storage (e.g., AsyncStorage) to keep you securely logged into your account across application sessions.
• Crash and Usage Analytics: We use integrated analytics tools to collect non-identifiable usage statistics, helping our engineering team troubleshoot software errors, page crashes, and optimize device battery utilization.

8. CHILDREN'S PRIVACY
The Services are strictly designed and intended for users who are at least 18 years of age. We do not knowingly collect, request, or maintain personal data from individuals under 18. If we become aware that a minor has registered an account, we will immediately suspend the account and permanently delete all associated personal data from our servers.

9. YOUR RIGHTS (GDPR AND GLOBAL COMPLIANCE)
Depending on your jurisdiction (such as the European Union under GDPR), you possess the following rights regarding your personal data:
• Right of Access: You can request a copy of all personal data we hold about you by selecting "Download My Data" under the Security & Privacy settings in the App.
• Right to Rectification: You can update or correct your profile information, email address, phone number, and physical addresses at any time.
• Right to Erasure (Deletion): You can request the deletion of your account and personal details through the "Delete Account" screen in the Settings page.
• Right to Data Portability: You can export your order records and profile data in a structured, machine-readable JSON format.
• Right to Opt-Out: You can withdraw consent for marketing communications and platform notifications at any time.

10. THIRD-PARTY SERVICES AND POLICIES
Our App integrates with third-party service providers who operate under their respective privacy policies. We encourage you to review their policies:
• Razorpay (Payment Processing): https://razorpay.com/privacy/
• Anthropic Claude (AI Chat Service): https://www.anthropic.com/legal/privacy
• Cloudinary (Image and Asset Hosting): https://cloudinary.com/privacy
• Google OAuth (User Authentication): https://policies.google.com/privacy
• Twilio (SMS Verification and OTPs): https://www.twilio.com/legal/privacy

11. POLICY REVISIONS AND UPDATES
We may modify or update this Privacy Policy from time to time. When updates are published, we will revise the "Last Updated" date at the top of this policy. If we make material changes to how we handle your personal data, we will notify you through an in-app popup notification or a direct email before the changes take effect.

12. CONTACT AND COMPLIANCE SUPPORT
For any inquiries, requests to exercise your rights, or data compliance questions, you may contact our Data Protection Officer:
• Email: privacy@ubsglobal.com
• Mailing Address: UBS Global Importing & Exporting Legal Department
• Response Time: We commit to reviewing and responding to all verified inquiries within thirty (30) days of receipt.`
      } else if (key === 'terms-and-conditions') {
        fallbackTitle = 'Terms & Conditions'
        fallbackContent = `UBS GLOBAL IMPORTING & EXPORTING - TERMS & CONDITIONS
Effective Date: June 2025

1. INTRODUCTION AND ACCEPTANCE OF TERMS
These Terms and Conditions constitute a legally binding contractual agreement between you ("User", "you", "your") and UBS Global Importing & Exporting ("Company", "we", "us", "our"). This Agreement governs your download, installation, registration, and usage of the UBS Global mobile application ("App") and all associated services, features, and content (collectively, the "Services"). By registering for, accessing, or using the Services, you agree to be bound by these terms. If you do not agree, you must immediately cease using the App.

2. ELIGIBILITY AND REGISTRATION REQUIREMENTS
You must be at least 18 years of age to create an account or perform transactions. By registering, you warrant that you have the legal capacity to enter into binding agreements and are not barred from international trade under local or international export regulations. You are permitted to register and maintain only one account per person.

3. ABOUT UBS GLOBAL PLATVORMS AND MARKETPLACE NATURE
UBS Global provides a multivendor eCommerce marketplace platform enabling users to list, sell, purchase, lease, and hire across several service portals: Products Marketplace, Real Estate listings, Job Portal, and Service Portal. UBS Global acts solely as an intermediary host. We are not the direct seller, landlord, employer, or direct service provider of the listings, and we are not a party to the transactions formed directly between buyers and sellers.

4. USER ACCOUNTS AND OTP VERIFICATION
• Registration: Registration requires a legal name, email address, and a valid phone number.
• Phone Verification: Phone verification via a Twilio-delivered One-Time Password (OTP) is strictly required to activate your account.
• Google OAuth: You may choose to sign up or log in using Google OAuth services, which remain subject to third-party authentication policies.
• Security: You are responsible for safeguarding your login credentials. You must notify us immediately of any unauthorized use.

5. BUYER TERMS AND PROTECTION
• Orders: By placing an order, you commit to purchase the listed product at the advertised price.
• Payment Obligations: Buyers must pay all checkout charges, including delivery fees and local tariffs. Payments are collected in USD via Razorpay.
• Confirmations: Order confirmations will be dispatched in-app and via SMS/Email.
• Delivery Expectations: Delivery timelines are estimated by sellers and shipping carriers.
• Dispute Resolution: Buyers may dispute transactions through the platform mediation channel if products are not received or are defective. Our Buyer Protection Policy governs valid refunds.

6. SELLER TERMS, VERIFICATION, AND COMMISSIONS
• Approval: Sellers must complete identity verification and submit documentation before listing goods.
• Descriptions: Sellers must describe products accurately and maintain inventory levels.
• Prohibited Products: Weapons, narcotics, counterfeit items, securities, and adult content are strictly banned.
• Commission: UBS Global deducts a 3% platform commission on all successful product and service sales.
• Withdrawals: Sellers can request withdrawals of their cleared balance. Withdrawals are processed within 2-3 business days.

7. REAL ESTATE LISTINGS
• Listing Fees: To list a property on the Real Estate Portal, a non-refundable listing fee of $0.52 USD is charged per post.
• Compliance: Landlords must submit accurate property details and verify ownership. Fraudulent listings will be deleted immediately without refund of the listing fee.

8. PAYMENT PROCESSING (USD & RAZORPAY)
• Processing: All monetary transactions are processed in United States Dollars (USD) via Razorpay.
• Commission Deduction: The 3% platform commission is automatically deducted from the seller's payout amount at the time of transaction settlement.
• Withdrawal Timing: Approved seller payout withdrawals to bank accounts are executed within 2-3 business days.

9. AI CHATBOT ENGAGEMENT
• Automated System: The App features an AI chat assistant powered by Anthropic's Claude AI for customer guidance and trade inquiries.
• Informational Use: AI responses are automated and provided for informational purposes only. They are not legally binding or guaranteed to be accurate. A human seller or platform administrator overrides any chatbot representations.

10. PROHIBITED PLATFORM ACTIVITIES
Users agree not to engage in fake listings, spamming, harassment of buyers/sellers, fraudulent payment attempts, account manipulation, intellectual property violations, or listing banned chemicals/materials.

11. INTELLECTUAL PROPERTY RIGHTS
UBS Global owns all proprietary software, designs, logos, and UI code. Users retain ownership of content they upload, but grant the Company a worldwide, royalty-free license to host, display, and distribute user listings on the platform.

12. LIMITATION OF LIABILITY
UBS Global is not liable for the quality, safety, authenticity, or delivery of products, properties, jobs, or services listed by third-party vendors. The Company's maximum liability cap is restricted to the amount paid by the user to the platform during the transaction under dispute.

13. DISPUTE RESOLUTION AND ESCALATION
In the event of a dispute, buyers and sellers must communicate via in-app chat (Socket.io). If unresolved, users may escalate the ticket to admin mediation. The administrator's decision regarding escrow payouts and refunds is final.

14. ACCOUNT SUSPENSION AND TERMINATION
We reserve the right to suspend or terminate accounts for terms violations, fraud, or harassment. Pending orders will be frozen or cancelled during the review. Users may appeal decisions to legal@ubsglobal.com.

15. GOVERNING LAW AND COMPLIANCE
These terms are governed by the laws of India, including the Consumer Protection Act 2019, Information Technology Act 2000, and other applicable electronic commerce rules. Arbitrations shall be conducted in India under sole jurisdiction.

16. CHANGES AND LEGAL CONTACT
We reserve the right to modify these Terms. Continued use of the App after updates constitutes acceptance.
• Legal Enquiries: legal@ubsglobal.com`
      } else if (key === 'refund-policy') {
        fallbackTitle = 'Refund Policy'
        fallbackContent = `UBS GLOBAL IMPORTING & EXPORTING - REFUND POLICY
Last Updated: June 2025

1. OVERVIEW
UBS Global operates as a multivendor trade venue. To ensure transaction safety, buyer payments are held securely in escrow until order delivery is verified. This policy outlines return criteria, cancellation rules, and refund channels.

2. ELIGIBLE REFUND CONDITIONS
Refund requests may be approved under the following conditions:
• Item Not Received: The package is not delivered within the guaranteed shipping window.
• Materially Different: The delivered item is significantly different from the seller's listing description.
• Damaged or Defective: The product arrives broken, non-functional, or structurally damaged.
• Wrong Item: The seller ships an incorrect product size, color, or model.
• Cancelled Order: The seller cancels the order before dispatching the goods.
• Duplicate Charge: A billing glitch results in a duplicate payment verification on Razorpay.

3. NON-ELIGIBLE REFUND CONDITIONS
Refunds are strictly denied for:
• Change of mind after the product is packaged or delivered.
• Dissatisfaction with an item that matches the listing description.
• Products damaged due to buyer mishandling, alteration, or usage.
• Items marked as "Non-Returnable" or custom-manufactured goods.
• Digital or virtual products.
• Real Estate Listing Fees: The $0.52 USD property listing fee is non-refundable.
• Platform Commission: The 3% sales commission deducted from transactions is non-refundable.

4. REFUND REQUEST PROCESS
• Step 1: Buyers must contact the seller via in-app chat within 48 hours of delivery to resolve issues.
• Step 2: If unresolved, the buyer opens a dispute through the App, providing photo or video evidence.
• Step 3: Admin reviews the dispute logs, images, and chat logs. Admin review takes 3-7 business days.

5. PAYMENT SETTLEMENT TIMELINES
Approved refunds are reversed back to the buyer's original payment method via Razorpay:
• Razorpay (Credit/Debit Card, International Checks): 5-7 business days.
• Bank Transfers: 3-5 business days.
• UPI Refunds: 1-2 business days.

6. PARTIAL REFUNDS
In scenarios where items are partially usable or missing accessories, the administrator may negotiate a partial refund. The percentage is calculated based on the cost of missing parts or repair valuations.

7. SELLER PAYMENT REVERSALS
When a refund is approved, the refund amount is deducted from the seller's pending escrow balance. The platform commission and transaction fees are refunded back to the buyer.

8. CANCELLED ORDERS
• Before Payment: No charges occur.
• After Payment, Before Shipping: Buyer receives a full refund immediately.
• After Shipping: Order cannot be cancelled; the buyer must receive the package and open a return dispute.

9. REAL ESTATE REFUND EXCLUSIONS
The $0.52 USD listing fee is non-refundable once the property listing is submitted. Booking fees, property inquiries, and tenant deposits are subject to the individual landlord's terms and local tenancy laws.

10. REFUNDS SUPPORT CONTACT
For refund disputes, contact:
• Email: refunds@ubsglobal.com (Response within 24-48 hours)
• In-App Support: Support ticket chat`
      } else if (key === 'account-deletion-policy') {
        fallbackTitle = 'Account Deletion Policy'
        fallbackContent = `UBS GLOBAL IMPORTING & EXPORTING - ACCOUNT DELETION POLICY
Last Updated: June 2025

1. YOUR RIGHT TO DELETE AND GDPR COMPLIANCE
In accordance with global data protection laws (such as GDPR) and Indian IT rules (Information Technology Act 2000), UBS Global respects your right to be forgotten. Users can request the permanent removal of their accounts and associated personal data.

2. HOW TO DELETE YOUR ACCOUNT
• Method 1 - In-App: Go to Profile > Settings > Account > Delete Account. You must request and confirm with a One-Time Password (OTP) sent to your registered phone. Once confirmed, the account is immediately deactivated and scheduled for full deletion in 30 days.
• Method 2 - Email: Email delete@ubsglobal.com with the subject "Account Deletion Request". Include your registered email address and phone number. We will acknowledge and deactivate your profile within 48 hours.

3. WHAT HAPPENS DURING DELETION
Upon initiating deletion:
• Login access and active authentication tokens are revoked.
• Profile name, email, phone number, and password hashes are queued for purging.
• Chat history is deleted from active systems.
• Wishlists, cart records, and search histories are cleared.
• In-app push notifications and alerts are stopped.

4. COMPLIANCE DATA RETENTION
In compliance with corporate tax audits, trade logs, and anti-money laundering (AML) laws:
• Order History: We must retain order transactional summaries for seven (7) years for tax auditing.
• Transaction Records: Financial ledger tokens processed via Razorpay are archived.
• Reviews: Reviews posted on product listings are anonymized (the author's name is replaced with "Deleted User") but the text remains.
• Fraud Prevention: Specific device logs are retained for a limited period to prevent repeat terms-of-service abuse.

5. IMPORTANT NOTES BEFORE DELETION
• Active Orders: Buyers cannot delete their accounts while orders are pending delivery. All orders must be completed or cancelled.
• Seller Balances: Sellers must withdraw all remaining balances before deletion. Accounts with pending payouts cannot be deleted.
• Active Listings: All active product, real estate, job, and service listings are deleted immediately upon account deactivation.

6. SELLER ACCOUNT DELETION SPECIFICS
Sellers cannot create a new vendor account using the same phone number, tax ID, or business registration details for ninety (90) days following deletion to prevent promotional code or verification abuse.

7. REACTIVATION LIMITATIONS
Once the 30-day deactivation grace period expires, the account data is permanently erased. Old order histories, ratings, and messaging threads are non-recoverable.

8. THIRD-PARTY DATA HANDLING
• Google OAuth: Authenticators are unlinked immediately.
• Razorpay: Payment transactions remain archived under Razorpay's compliance policies.
• Cloudinary: Uploaded product and property images are deleted from Cloudinary storage within 30 days.

9. PROCESSING TIMELINE
• Deactivation: Immediate upon OTP confirmation.
• Acknowledgment: Within 48 hours.
• Full Data Deletion: 30 days.
• Backup Server Purge: 90 days.

10. CONTACT FOR DELETIONS
For deletion inquiries, contact:
• Email: delete@ubsglobal.com
• In-App Support Chat (Response within 48 hours)`
      }

      return res.json({
        success: true,
        legalDoc: {
          key,
          title: fallbackTitle || 'Legal Compliance Policy',
          content: fallbackContent
        }
      })
    }

    res.json({
      success: true,
      legalDoc: doc
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
