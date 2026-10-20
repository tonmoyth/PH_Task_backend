import { redis } from '../config/redis';

/**
 * Generic cache-aside helper
 * @param key - Cache key (যেমন: "product:123")
 * @param fetchFn - DB থেকে data আনার function
 * @param ttl - Time to live (সেকেন্ডে), default 1 ঘণ্টা
 */
export async function getCached<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = 3600
): Promise<T> {
    try {
        // Step 1: Cache এ আছে কিনা চেক করুন
        const cached = await redis.get(key);
        if (cached) {
            return JSON.parse(cached) as T;
        }
    } catch (err) {
        // Redis fail করলেও যেন app বন্ধ না হয়ে যায়
        console.error(`Cache read error for key ${key}:`, err);
    }

    // Step 2: Cache এ না থাকলে আসল ফাংশন থেকে ডেটা আনুন
    const data = await fetchFn();

    // Step 3: ডেটা থাকলে cache এ সংরক্ষণ করুন
    if (data !== null && data !== undefined) {
        try {
            await redis.setex(key, ttl, JSON.stringify(data));
        } catch (err) {
            console.error(`Cache write error for key ${key}:`, err);
        }
    }

    return data;
}

/**
 * নির্দিষ্ট key(s) মুছে ফেলুন (update/delete এর পর ব্যবহার করবেন)
 */
export async function invalidateCache(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await redis.del(...keys);
}

/**
 * Pattern match করে অনেকগুলো key একসাথে মুছুন
 * উদাহরণ: invalidateByPattern("product:*")
 * বড় dataset এ safe (KEYS command ব্যবহার করে না, ব্লক করে না)
 */
export async function invalidateByPattern(pattern: string): Promise<number> {
    const stream = redis.scanStream({ match: pattern, count: 100 });
    const keysToDelete: string[] = [];

    return new Promise((resolve, reject) => {
        stream.on('data', (keys: string[]) => {
            keysToDelete.push(...keys);
        });

        stream.on('end', async () => {
            if (keysToDelete.length > 0) {
                await redis.del(...keysToDelete);
            }
            resolve(keysToDelete.length);
        });

        stream.on('error', reject);
    });
}