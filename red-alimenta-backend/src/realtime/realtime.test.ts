import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { io as createClient } from 'socket.io-client';
import { RolUsuario } from '@prisma/client';
import { AppError } from '../lib/errors';
import { RealtimeIdentity, recipientRooms } from './RealtimeHub';
import { createRealtimeSocketServer } from './socketServer';

const identities: Record<string, RealtimeIdentity> = {
  bankMember: {
    userId: 10,
    sessionId: 'session-bank-10',
    role: RolUsuario.BANCO,
    accountStatus: 'ACTIVA',
    bankIds: [42],
  },
  donor: {
    userId: 11,
    sessionId: 'session-donor-11',
    role: RolUsuario.DONANTE,
    accountStatus: 'ACTIVA',
    bankIds: [],
  },
  unrelated: {
    userId: 12,
    sessionId: 'session-unrelated-12',
    role: RolUsuario.DONANTE,
    accountStatus: 'ACTIVA',
    bankIds: [],
  },
};

test('realtime changes reach authorized rooms once and not unrelated users', async (t) => {
  const httpServer = createServer();
  const { io, hub } = createRealtimeSocketServer(httpServer, async (token) => {
    const identity = identities[token];
    if (!identity) throw new AppError('Invalid token', 401);
    return identity;
  });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address() as AddressInfo;
  const endpoint = `http://127.0.0.1:${address.port}`;
  const bankMember = createClient(endpoint, { auth: { token: 'bankMember' } });
  const donor = createClient(endpoint, { auth: { token: 'donor' } });
  const unrelated = createClient(endpoint, { auth: { token: 'unrelated' } });
  t.after(async () => {
    bankMember.disconnect();
    donor.disconnect();
    unrelated.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  const waitForConnect = (socket: ReturnType<typeof createClient>) => new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  await Promise.all([
    waitForConnect(bankMember),
    waitForConnect(donor),
    waitForConnect(unrelated),
  ]);
  const waitForChange = (socket: ReturnType<typeof createClient>) =>
    new Promise<unknown[]>((resolve) => {
      socket.once('data:changed', (...args) => resolve(args));
    });
  const bankChange = waitForChange(bankMember);
  const donorChange = waitForChange(donor);
  let unrelatedReceived = false;
  unrelated.on('data:changed', () => { unrelatedReceived = true; });

  hub.publish(
    { bankIds: [42], userIds: [11] },
    { type: 'donation.created', resource: 'donations', resourceId: 501 },
  );
  const [[change], [donorNotification]] = await Promise.all([bankChange, donorChange]);
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal((change as { type: string }).type, 'donation.created');
  assert.equal((donorNotification as { resourceId: number }).resourceId, 501);
  assert.equal(unrelatedReceived, false);

  let receivedCount = 0;
  bankMember.on('data:changed', () => { receivedCount += 1; });
  hub.publish(
    { bankIds: [42], userIds: [10] },
    { type: 'delivery.updated', resource: 'deliveries', resourceId: 502 },
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(receivedCount, 1);
});

test('recipient rooms are deduplicated and never include a global room', () => {
  assert.deepEqual(
    recipientRooms({ userIds: [10, 10], bankIds: [42], roles: [RolUsuario.SUPER_ADMIN] }),
    ['user:10', 'bank:42', 'role:SUPER_ADMIN'],
  );
});

test('removing a bank membership revokes only that bank room', async (t) => {
  const httpServer = createServer();
  const { io, hub } = createRealtimeSocketServer(httpServer, async (token) => {
    const identity = identities[token];
    if (!identity) throw new AppError('Invalid token', 401);
    return identity;
  });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address() as AddressInfo;
  const socket = createClient(`http://127.0.0.1:${address.port}`, {
    auth: { token: 'bankMember' },
  });
  t.after(async () => {
    socket.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });

  let bankEventReceived = false;
  socket.on('data:changed', () => { bankEventReceived = true; });
  hub.removeUserFromBank(10, 42);
  hub.publish({ bankIds: [42] }, { type: 'bank.deleted', resource: 'banks', resourceId: 42 });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(bankEventReceived, false);

  const ownEvent = new Promise<void>((resolve) => socket.once('data:changed', () => resolve()));
  hub.publish({ userIds: [10] }, { type: 'user.updated', resource: 'users', resourceId: 10 });
  await ownEvent;
});
