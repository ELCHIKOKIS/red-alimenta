import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { Server } from 'socket.io';

export async function configureRealtimeAdapter(io: Server): Promise<() => Promise<void>> {
  const url = process.env.REALTIME_REDIS_URL;
  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('Realtime is process-local; configure REALTIME_REDIS_URL before scaling horizontally.');
    }
    return async () => {};
  }

  const publisher = createClient({ url });
  const subscriber = publisher.duplicate();
  try {
    await Promise.all([publisher.connect(), subscriber.connect()]);
  } catch {
    publisher.destroy();
    subscriber.destroy();
    console.warn('Realtime Redis is unavailable; realtime remains process-local and REST remains available.');
    return async () => {};
  }
  io.adapter(createAdapter(publisher, subscriber));

  return async () => {
    await Promise.allSettled([publisher.quit(), subscriber.quit()]);
  };
}
