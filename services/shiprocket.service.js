const axios = require('axios')

/**
 * Production-Ready Shiprocket External API v2 Service
 * Handles Authentication, Token Caching, Automatic 401 Token Refresh,
 * Rate Limit Handling, and Exponential Backoff Retries.
 */
class ShiprocketService {
  constructor() {
    this.baseURL = 'https://apiv2.shiprocket.in/v1/external'
    this.token = null
    this.tokenExpiresAt = null

    // Configure Axios Instance
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    // Setup request interceptor to attach Bearer token
    this.client.interceptors.request.use(async (config) => {
      // Exclude login endpoint from token attachment
      if (!config.url.includes('/auth/login')) {
        const token = await this.getToken()
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    }, (error) => Promise.reject(error))

    // Setup response interceptor for 401 auto-refresh and exponential backoff
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config
        
        // Handle 401 Unauthorized - Auto Token Refresh
        if (error.response && error.response.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true
          console.warn('⚠️ [Shiprocket] Received 401 Unauthorized. Refreshing token...')
          try {
            await this.authenticate(true) // Force fresh token
            originalRequest.headers.Authorization = `Bearer ${this.token}`
            return this.client(originalRequest)
          } catch (authErr) {
            console.error('❌ [Shiprocket] Re-authentication failed:', authErr.message)
            return Promise.reject(authErr)
          }
        }

        // Handle 429 Rate Limit or 5xx Network Failure with Exponential Backoff
        if (!originalRequest._retryCount) originalRequest._retryCount = 0
        const isRateLimited = error.response && error.response.status === 429
        const isServerError = error.response && error.response.status >= 500
        const isNetworkError = !error.response

        if ((isRateLimited || isServerError || isNetworkError) && originalRequest._retryCount < 3) {
          originalRequest._retryCount += 1
          const backoffDelay = Math.pow(2, originalRequest._retryCount) * 500 // 1s, 2s, 4s
          console.warn(`⏳ [Shiprocket] Retry attempt ${originalRequest._retryCount} after ${backoffDelay}ms for request: ${originalRequest.url}`)
          await new Promise((resolve) => setTimeout(resolve, backoffDelay))
          return this.client(originalRequest)
        }

        return Promise.reject(error)
      }
    )
  }

  /**
   * Authenticates with Shiprocket API v2
   * Uses process.env.SHIPROCKET_API_EMAIL & process.env.SHIPROCKET_API_PASSWORD
   */
  async authenticate(force = false) {
    if (!force && this.token && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
      return this.token
    }

    const email = process.env.SHIPROCKET_API_EMAIL
    const password = process.env.SHIPROCKET_API_PASSWORD

    if (!email || !password) {
      console.error('❌ [Shiprocket] Missing API Credentials in environment variables.')
      throw new Error('SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD are required.')
    }

    try {
      console.log('🔑 [Shiprocket] Authenticating user API credentials...')
      const response = await axios.post(`${this.baseURL}/auth/login`, {
        email,
        password
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      })

      if (response.data && response.data.token) {
        this.token = response.data.token
        // Token valid for 9 days (Shiprocket tokens expire in 10 days)
        this.tokenExpiresAt = Date.now() + (9 * 24 * 60 * 60 * 1000)
        console.log('✅ [Shiprocket] Authentication successful. Token cached.')
        return this.token
      } else {
        throw new Error(response.data?.message || 'Authentication returned invalid payload')
      }
    } catch (error) {
      console.error('❌ [Shiprocket Auth Failed]:', error.response?.data || error.message)
      throw new Error(`Shiprocket Auth Failed: ${error.response?.data?.message || error.message}`)
    }
  }

  /**
   * Returns valid JWT Bearer Token
   */
  async getToken() {
    if (!this.token || !this.tokenExpiresAt || Date.now() >= this.tokenExpiresAt) {
      await this.authenticate()
    }
    return this.token
  }

  /**
   * Check Courier Serviceability & Calculate Shipping Fees
   */
  async checkServiceability({ pickup_postcode, delivery_postcode, weight, cod = 0, length, width, height }) {
    try {
      const params = {
        pickup_postcode,
        delivery_postcode,
        weight: parseFloat(weight) || 0.5,
        cod: cod ? 1 : 0,
        length: parseFloat(length) || 10,
        width: parseFloat(width) || 10,
        height: parseFloat(height) || 10
      }

      console.log('📦 [Shiprocket] Checking serviceability:', params)
      const response = await this.client.get('/courier/serviceability', { params })
      return response.data
    } catch (error) {
      console.error('❌ [Shiprocket Serviceability Error]:', error.response?.data || error.message)
      throw new Error(error.response?.data?.message || 'Failed to check shipping serviceability')
    }
  }

  /**
   * Create Adhoc Order in Shiprocket
   */
  async createOrder(orderData) {
    try {
      console.log('📝 [Shiprocket] Creating order adhoc for order:', orderData.order_id)
      const response = await this.client.post('/orders/create/adhoc', orderData)
      return response.data
    } catch (error) {
      console.error('❌ [Shiprocket Create Order Error]:', error.response?.data || error.message)
      throw new Error(error.response?.data?.message || 'Failed to create order on Shiprocket')
    }
  }

  /**
   * Assign AWB (Air Waybill) to Shipment
   */
  async assignAWB({ shipment_id, courier_id }) {
    try {
      console.log(`🏷️ [Shiprocket] Assigning AWB for shipment_id: ${shipment_id}, courier_id: ${courier_id || 'auto'}`)
      const payload = { shipment_id }
      if (courier_id) payload.courier_id = courier_id

      const response = await this.client.post('/courier/assign/awb', payload)
      return response.data
    } catch (error) {
      console.error('❌ [Shiprocket Assign AWB Error]:', error.response?.data || error.message)
      throw new Error(error.response?.data?.message || 'Failed to assign AWB')
    }
  }

  /**
   * Generate Pickup Request
   */
  async generatePickup({ shipment_id }) {
    try {
      console.log(`🚚 [Shiprocket] Generating pickup for shipment_id: ${shipment_id}`)
      const response = await this.client.post('/courier/generate/pickup', {
        shipment_id: Array.isArray(shipment_id) ? shipment_id : [shipment_id]
      })
      return response.data
    } catch (error) {
      console.error('❌ [Shiprocket Generate Pickup Error]:', error.response?.data || error.message)
      throw new Error(error.response?.data?.message || 'Failed to generate pickup request')
    }
  }

  /**
   * Generate Manifest
   */
  async generateManifest({ shipment_id }) {
    try {
      console.log(`📋 [Shiprocket] Generating manifest for shipment_id: ${shipment_id}`)
      const response = await this.client.post('/manifests/generate', {
        shipment_id: Array.isArray(shipment_id) ? shipment_id : [shipment_id]
      })
      return response.data
    } catch (error) {
      console.error('❌ [Shiprocket Generate Manifest Error]:', error.response?.data || error.message)
      throw new Error(error.response?.data?.message || 'Failed to generate manifest')
    }
  }

  /**
   * Print Manifest
   */
  async printManifest({ order_ids }) {
    try {
      console.log('🖨️ [Shiprocket] Printing manifest for order_ids:', order_ids)
      const response = await this.client.post('/manifests/print', {
        order_ids: Array.isArray(order_ids) ? order_ids : [order_ids]
      })
      return response.data
    } catch (error) {
      console.error('❌ [Shiprocket Print Manifest Error]:', error.response?.data || error.message)
      throw new Error(error.response?.data?.message || 'Failed to print manifest')
    }
  }

  /**
   * Generate Shipping Label
   */
  async generateLabel({ shipment_id }) {
    try {
      console.log(`🏷️ [Shiprocket] Generating label for shipment_id: ${shipment_id}`)
      const response = await this.client.post('/courier/generate/label', {
        shipment_id: Array.isArray(shipment_id) ? shipment_id : [shipment_id]
      })
      return response.data
    } catch (error) {
      console.error('❌ [Shiprocket Generate Label Error]:', error.response?.data || error.message)
      throw new Error(error.response?.data?.message || 'Failed to generate shipping label')
    }
  }

  /**
   * Print / Generate Invoice
   */
  async printInvoice({ ids }) {
    try {
      console.log('🧾 [Shiprocket] Printing invoice for ids:', ids)
      const response = await this.client.post('/orders/print/invoice', {
        ids: Array.isArray(ids) ? ids : [ids]
      })
      return response.data
    } catch (error) {
      console.error('❌ [Shiprocket Print Invoice Error]:', error.response?.data || error.message)
      throw new Error(error.response?.data?.message || 'Failed to print invoice')
    }
  }

  /**
   * Alias for generateInvoice (uses printInvoice)
   */
  async generateInvoice(orderIds) {
    return this.printInvoice({ ids: orderIds })
  }

  /**
   * Helper: Download Label (Generates & returns label URL)
   */
  async downloadLabel(shipmentId) {
    const data = await this.generateLabel({ shipment_id: shipmentId })
    return data?.label_url || data?.url || null
  }

  /**
   * Helper: Download Manifest (Generates & returns manifest URL)
   */
  async downloadManifest(shipmentId) {
    const data = await this.generateManifest({ shipment_id: shipmentId })
    return data?.manifest_url || data?.url || null
  }

  /**
   * Track Shipment by AWB Code
   */
  async trackShipment(awbCode) {
    try {
      console.log(`📍 [Shiprocket] Tracking shipment AWB: ${awbCode}`)
      const response = await this.client.get(`/courier/track/awb/${awbCode}`)
      return response.data
    } catch (error) {
      console.error('❌ [Shiprocket Track Shipment Error]:', error.response?.data || error.message)
      throw new Error(error.response?.data?.message || 'Failed to track shipment')
    }
  }

  /**
   * Cancel Shipment
   */
  async cancelShipment({ ids }) {
    try {
      console.log('🚫 [Shiprocket] Cancelling shipment ids:', ids)
      const response = await this.client.post('/orders/cancel', {
        ids: Array.isArray(ids) ? ids : [ids]
      })
      return response.data
    } catch (error) {
      console.error('❌ [Shiprocket Cancel Order Error]:', error.response?.data || error.message)
      throw new Error(error.response?.data?.message || 'Failed to cancel shipment on Shiprocket')
    }
  }

  /**
   * Register / Sync Seller Pickup Address with Shiprocket
   */
  async addPickupAddress(pickupData) {
    try {
      console.log('🏢 [Shiprocket] Adding vendor pickup location:', pickupData.pickup_location)
      const response = await this.client.post('/settings/company/addpickup', pickupData)
      return response.data
    } catch (error) {
      console.error('❌ [Shiprocket Add Pickup Address Error]:', error.response?.data || error.message)
      throw new Error(error.response?.data?.message || 'Failed to add pickup address to Shiprocket')
    }
  }
}

// Export singleton instance
module.exports = new ShiprocketService()
