import Redis from 'ioredis';
import { envVeriables } from './envConfig';

class RedisClient {
    private static instance: Redis;

    static getInstance(): Redis {
        if (!RedisClient.instance) {
            RedisClient.instance = new Redis({
                host: envVeriables.REDIS_HOST || 'localhost',
                port: Number(envVeriables.REDIS_PORT) || 6379,
                password: envVeriables.REDIS_PASSWORD || undefined,
                maxRetriesPerRequest: 1,
                retryStrategy(times) {
                    if (times > 3) {
                        return null; // Stop reconnecting and fall back cleanly to memory store
                    }
                    return Math.min(times * 200, 1000);
                },
            });

            let errorLogged = false;

            RedisClient.instance.on('connect', () => {
                console.log('✅ Redis connected successfully');
                errorLogged = false;
            });

            RedisClient.instance.on('error', (err) => {
                if (!errorLogged) {
                    console.warn('⚠️ Redis connection error (using in-memory fallback):', err.message);
                    errorLogged = true;
                }
            });
        }
        return RedisClient.instance;
    }
}

export const redis = RedisClient.getInstance();