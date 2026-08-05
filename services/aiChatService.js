const Anthropic = require('@anthropic-ai/sdk')
const BotSession = require('../models/BotSession')
const BotConfig = require('../models/BotConfig')
const Product = require('../models/Product')
const Seller = require('../models/Seller')
const Property = require('../models/Property')

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'fake_key_for_init'
})

// Smart Fallback Engine when LLM API is unavailable or throws errors
function buildSmartFallbackReply(buyerMessage, context, botConfig) {
  const msg = (buyerMessage || '').toLowerCase().trim();
  const shopName = context?.sellerShopName || botConfig?.botName || 'UBS Global';
  const prodName = context?.productName;
  const prodPrice = context?.productPrice;
  const prodDesc = context?.productDescription;
  const propTitle = context?.propertyTitle;
  const propPrice = context?.propertyPrice;
  const customWelcome = botConfig?.welcomeMessage;

  // Greetings / First Messages
  if (/^(hi|hello|hey|greetings|hola|namaste|good morning|good evening|hey there)/i.test(msg) || msg.length <= 4) {
    if (customWelcome && customWelcome.trim()) {
      return customWelcome.trim();
    }
    return `Hello! 👋 Thank you for reaching out to UBS Global. How can we help you with your order, pricing, or product inquiry today?`;
  }

  // Price & Discount inquiries
  if (msg.includes('price') || msg.includes('cost') || msg.includes('how much') || msg.includes('rate') || msg.includes('discount')) {
    if (prodPrice) {
      return `The price for "${prodName}" is $${prodPrice}. 🏷️ You can order it directly on UBS Global!`;
    }
    if (propPrice) {
      return `The listed price for "${propTitle}" is $${propPrice}. 🏡`;
    }
    return `For pricing and wholesale quote details from ${shopName}, please check the product details or let us know your required volume!`;
  }

  // Stock / Availability
  if (msg.includes('stock') || msg.includes('available') || msg.includes('quantity') || msg.includes('in stock')) {
    if (prodName) {
      return `Yes! "${prodName}" is listed by ${shopName}. You can check live availability and place an order on the product page! 📦`;
    }
    return `Products from ${shopName} are in stock and ready for global dispatch. Let us know how many units you need!`;
  }

  // Shipping & Delivery
  if (msg.includes('ship') || msg.includes('deliver') || msg.includes('dispatch') || msg.includes('country') || msg.includes('courier')) {
    if (context?.propertyLocation) {
      return `This property is located at ${context.propertyLocation}. 📍`;
    }
    return `We offer worldwide shipping via UBS Global logistics! Standard delivery usually takes 3-7 business days depending on destination. ✈️📦`;
  }

  // Buying / Checkout
  if (msg.includes('buy') || msg.includes('order') || msg.includes('purchase') || msg.includes('cart') || msg.includes('checkout')) {
    if (prodName) {
      return `You can buy "${prodName}" right now by tapping "Buy Now" or "Add to Cart" on the product details page! 🛒✨`;
    }
    return `To purchase, simply use the "Buy Now" or "Add to Cart" button on the item page! 🛒`;
  }

  // Specifications
  if (msg.includes('spec') || msg.includes('detail') || msg.includes('material') || msg.includes('feature') || msg.includes('size')) {
    if (prodDesc) {
      return `Here are details for "${prodName}": ${prodDesc.substring(0, 160)}... 📋`;
    }
  }

  // Default response
  if (customWelcome && customWelcome.trim()) {
    return customWelcome.trim();
  }

  if (prodName) {
    return `Thank you for asking about "${prodName}"! ${shopName} team is happy to assist. Let us know if you need info on price, specs, or shipping! 😊`;
  }

  return `Hello! 👋 Thank you for reaching out to UBS Global. How can we help you with your order, pricing, or product inquiry today?`;
}

// Build system prompt for bot
const buildSystemPrompt = (context, botConfig) => {
  return `You are ${botConfig?.botName || 'UBS Assistant'}, a helpful AI assistant for UBS Global Importing & Exporting marketplace.

You are representing this seller/shop:
- Shop Name: ${context.sellerShopName || 'UBS Global Shop'}
- Shop Rating: ${context.sellerRating || 'Not available'}
- Shop Description: ${context.sellerDescription || ''}

${context.productName ? `
The buyer is asking about this product:
- Product Name: ${context.productName}
- Price: $${context.productPrice}
- Description: ${context.productDescription}
` : ''}

${context.propertyTitle ? `
The buyer is asking about this property:
- Title: ${context.propertyTitle}
- Price: $${context.propertyPrice}
- Location: ${context.propertyLocation}
- Type: ${context.propertyType}
- Bedrooms: ${context.propertyBedrooms}
- Bathrooms: ${context.propertyBathrooms}
- Area: ${context.propertyArea}
- Description: ${context.propertyDescription}
` : ''}

Your responsibilities:
1. Answer questions about the product/property
2. Provide pricing and shipping information
3. Help with order inquiries
4. Be friendly and professional
5. Keep responses SHORT and helpful (max 3 sentences)
6. Use emojis occasionally to be friendly
7. If asked about specific order details you don't have, say "Let me connect you with our team for this"
8. Always respond in the same language as the buyer
9. Never make up information you don't have
10. If buyer wants to buy, encourage them with "You can click the Buy Now button to purchase!"

${botConfig?.customInstructions || ''}

Important: Be conversational, helpful, and concise. Do not write long paragraphs.`
}

// Check if human takeover needed
const needsHumanTakeover = (
  message,
  session,
  botConfig
) => {
  const msg = message.toLowerCase()

  // Check keywords
  const keywords = botConfig?.humanTakeoverKeywords
    || [
      'speak to human',
      'real person',
      'agent',
      'manager',
      'complaint',
      'refund',
      'cancel order'
    ]
  if (keywords.some(k => msg.includes(k.toLowerCase()))) {
    return {
      needed: true,
      reason: 'keyword_triggered'
    }
  }

  // Check message count
  const maxMessages = botConfig?.autoTakeoverAfter || 10
  if (session.messageCount >= maxMessages) {
    return {
      needed: true,
      reason: 'auto_takeover'
    }
  }

  return { needed: false }
}

// Main function: Get AI reply
exports.getAIReply = async (
  chatRoomId,
  buyerMessage,
  roomContext
) => {
  try {
    // Get or create bot session
    let session = await BotSession.findOne({ chatRoomId })

    if (!session) {
      // Build context from product/seller/property
      let context = {}

      if (roomContext.productId) {
        const product = await Product.findById(
          roomContext.productId
        ).populate('sellerId')

        if (product) {
          context = {
            productId: product._id.toString(),
            productName: product.title,
            productPrice: product.price,
            productDescription: product.description,
            productImages: product.images,
            sellerShopName: product.sellerId?.shopName,
            sellerDescription: product.sellerId?.description,
            sellerRating: product.sellerId?.rating
          }
        }
      }

      if (roomContext.propertyId) {
        const property = await Property.findById(
          roomContext.propertyId
        )

        if (property) {
          context = {
            propertyTitle: property.title,
            propertyPrice: property.price,
            propertyLocation: `${property.address?.city || ''}, ${property.address?.country || ''}`,
            propertyType: property.propertyType,
            propertyBedrooms: property.bedrooms,
            propertyBathrooms: property.bathrooms,
            propertyArea: `${property.area || ''} ${property.areaUnit || ''}`,
            propertyDescription: property.description
          }
        }
      }

      session = await BotSession.create({
        chatRoomId,
        buyerId: roomContext.buyerId,
        sellerId: roomContext.sellerId,
        botActive: true,
        context,
        conversationHistory: []
      })
    } else {
      // Always ensure bot is active when buyer sends a message
      if (!session.botActive) {
        session.botActive = true
        session.deactivatedReason = null
        await session.save()
      }
    }

    // Get bot config for this seller
    const botConfig = await BotConfig.findOne({
      sellerId: session.sellerId
    })

    // Check if human takeover needed
    const takeover = needsHumanTakeover(
      buyerMessage,
      session,
      botConfig
    )

    if (takeover.needed) {
      // Deactivate bot
      session.botActive = false
      session.deactivatedReason = takeover.reason
      await session.save()

      return {
        success: true,
        botActive: false,
        takeover: true,
        takeoverReason: takeover.reason,
        message: "I'm connecting you with our team for better assistance. Please wait... 🔄"
      }
    }

    // Add buyer message to history
    session.conversationHistory.push({
      role: 'user',
      content: buyerMessage,
      timestamp: new Date()
    })

    // Keep only last 20 messages for context
    if (session.conversationHistory.length > 20) {
      session.conversationHistory = session.conversationHistory.slice(-20)
    }

    let aiReply = '';

    // Attempt Anthropic Claude call if key is present
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'fake_key_for_init') {
      try {
        const messages = session.conversationHistory.map(
          msg => ({
            role: msg.role,
            content: msg.content
          })
        )

        const response = await anthropic.messages.create({
          model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
          max_tokens: 300,
          system: buildSystemPrompt(
            session.context,
            botConfig
          ),
          messages
        })

        aiReply = response.content[0]?.text
      } catch (llmErr) {
        console.log('Anthropic API Call Fallback triggered:', llmErr?.message);
      }
    }

    // Fallback to Smart Engine if LLM did not return text
    if (!aiReply) {
      aiReply = buildSmartFallbackReply(buyerMessage, session.context || {}, botConfig);
    }

    // Add AI reply to history
    session.conversationHistory.push({
      role: 'assistant',
      content: aiReply,
      timestamp: new Date()
    })

    session.messageCount += 1
    session.lastBotReply = new Date()
    await session.save()

    return {
      success: true,
      botActive: true,
      reply: aiReply,
      messageCount: session.messageCount
    }

  } catch (error) {
    console.error('AI Chat Error:', error)
    const fallbackReply = buildSmartFallbackReply(buyerMessage, roomContext || {}, null);
    return {
      success: true,
      botActive: true,
      reply: fallbackReply,
      messageCount: 1
    }
  }
}

// Deactivate bot (seller takeover)
exports.deactivateBot = async (
  chatRoomId,
  reason = 'seller_takeover'
) => {
  await BotSession.findOneAndUpdate(
    { chatRoomId },
    {
      $set: {
        botActive: false,
        deactivatedReason: reason
      }
    },
    { upsert: true }
  )
}

// Check if bot is active
exports.isBotActive = async (chatRoomId) => {
  const session = await BotSession.findOne({ chatRoomId })
  if (!session) {
    return true // Default to active if no session exists yet
  }
  // Only respect seller takeover if seller took over in the last 2 minutes
  if (session.botActive === false && session.deactivatedReason === 'seller_takeover') {
    const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000)
    if (session.updatedAt && session.updatedAt > twoMinsAgo) {
      return false
    }
  }
  return true
}

// Get bot session
exports.getBotSession = async (chatRoomId) => {
  return await BotSession.findOne({
    chatRoomId,
    botActive: true
  })
}
