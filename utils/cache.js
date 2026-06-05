const redis = require('redis');

let redisClient = null;
let isRedisConnected = false;

// In-memory fallback cache Map
const memoryCache = new Map();

const initCache = async () => {
  if (process.env.REDIS_URL) {
    try {
      redisClient = redis.createClient({ url: process.env.REDIS_URL });
      redisClient.on('error', (err) => {
        console.error('❌ Redis Client Error:', err.message || err);
        isRedisConnected = false;
      });
      redisClient.on('connect', () => {
        console.log('✅ Connected to Redis successfully');
        isRedisConnected = true;
      });
      await redisClient.connect();
    } catch (e) {
      console.warn('⚠️ Failed to initialize Redis. Using in-memory fallback.', e.message);
      redisClient = null;
      isRedisConnected = false;
    }
  } else {
    console.log('ℹ️ REDIS_URL not defined. In-memory cache active.');
  }
};

initCache();

const get = async (key) => {
  if (isRedisConnected && redisClient) {
    try {
      const val = await redisClient.get(key);
      return val ? JSON.parse(val) : null;
    } catch (e) {
      console.error('Redis GET error:', e);
    }
  }
  
  const memVal = memoryCache.get(key);
  if (memVal) {
    if (memVal.expiry && memVal.expiry < Date.now()) {
      memoryCache.delete(key);
      return null;
    }
    return memVal.value;
  }
  return null;
};

const set = async (key, value, ttlSeconds = 300) => {
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.set(key, JSON.stringify(value), {
        EX: ttlSeconds
      });
      return;
    } catch (e) {
      console.error('Redis SET error:', e);
    }
  }
  
  memoryCache.set(key, {
    value,
    expiry: Date.now() + ttlSeconds * 1000
  });
};

const del = async (key) => {
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.del(key);
      return;
    } catch (e) {
      console.error('Redis DEL error:', e);
    }
  }
  
  memoryCache.delete(key);
};

const clear = async () => {
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.flushDb();
      return;
    } catch (e) {
      console.error('Redis FLUSHDB error:', e);
    }
  }
  
  memoryCache.clear();
};

module.exports = {
  get,
  set,
  del,
  clear
};
