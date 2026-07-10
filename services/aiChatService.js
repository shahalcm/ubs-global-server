const Anthropic = require('@anthropic-ai/sdk')
const BotSession = require('../models/BotSession')
const BotConfig = require('../models/BotConfig')
const Product = require('../models/Product')
const Seller = require('../models/Seller')
const Property = require('../models/Property')

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'fake_key_for_init'
})

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
    let session = await BotSession.findOne({
      chatRoomId,
      botActive: true
    })

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

    // Build messages array for Claude
    const messages = session.conversationHistory.map(
      msg => ({
        role: msg.role,
        content: msg.content
      })
    )

    // Get AI response
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 300,
      system: buildSystemPrompt(
        session.context,
        botConfig
      ),
      messages
    })

    const aiReply =
      response.content[0]?.text ||
      "I'm here to help! Could you please rephrase your question? 😊"

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
    return {
      success: false,
      botActive: false,
      error: error.message,
      reply: "Sorry, I'm having trouble right now. The seller will assist you shortly! 🙏"
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
  return session.botActive
}

// Get bot session
exports.getBotSession = async (chatRoomId) => {
  return await BotSession.findOne({
    chatRoomId,
    botActive: true
  })
}
