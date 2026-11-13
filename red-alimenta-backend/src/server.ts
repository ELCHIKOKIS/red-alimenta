import 'dotenv/config';
import { createServer } from 'node:http';
import app from './app';
import { createRealtimeSocketServer } from './realtime/socketServer';
import { setRealtimeHub } from './realtime/RealtimeHub';
import { configureRealtimeAdapter } from './realtime/redisAdapter';

const port = Number(process.env.PORT || 4000);
const httpServer = createServer(app);
const { io, hub } = createRealtimeSocketServer(httpServer);
let closeRealtimeAdapter: (() => Promise<void>) | undefined;

async function startServer() {
  closeRealtimeAdapter = await configureRealtimeAdapter(io);
  setRealtimeHub(hub);
  httpServer.listen(port, () => {
    console.log(`RED-ALIMENTA API running on http://localhost:${port}`);
  });
}

process.once('SIGTERM', () => {
  io.close();
  void closeRealtimeAdapter?.();
});

void startServer().catch((error: unknown) => {
  console.error('Unable to start RED-ALIMENTA API; check the realtime adapter configuration.');
  process.exitCode = 1;
});
