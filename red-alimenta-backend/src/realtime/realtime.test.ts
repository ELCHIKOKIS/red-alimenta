import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { io as createClient } from 'socket.io-client';
import { RolUsuario } from '@prisma/client';
import { AppError } from '../lib/errors';
import { coverageRoom, RealtimeIdentity, recipientRooms } from './RealtimeHub';
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
  inactiveDonor: {
    userId: 13,
    sessionId: 'session-inactive-donor-13',
    role: RolUsuario.DONANTE,
    accountStatus: 'SUSPENDIDA',
    bankIds: [],
  },
  beneficiary: {
    userId: 14,
    sessionId: 'session-beneficiary-14',
    role: RolUsuario.BENEFICIARIO,
    accountStatus: 'ACTIVA',
    bankIds: [],
    beneficiaryCoverage: { departamento: 'Cauca', municipio: 'Popayán' },
  },
  otherBeneficiary: {
    userId: 15,
    sessionId: 'session-other-beneficiary-15',
    role: RolUsuario.BENEFICIARIO,
    accountStatus: 'ACTIVA',
    bankIds: [],
    beneficiaryCoverage: { departamento: 'Cauca', municipio: 'Cali' },
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

test('role changes reach active clients of that role only', async (t) => {
  const httpServer = createServer();
  const { io, hub } = createRealtimeSocketServer(httpServer, async (token) => {
    const identity = identities[token];
    if (!identity) throw new AppError('Invalid token', 401);
    return identity;
  });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address() as AddressInfo;
  const endpoint = `http://127.0.0.1:${address.port}`;
  const donor = createClient(endpoint, { auth: { token: 'donor' } });
  const unrelatedDonor = createClient(endpoint, { auth: { token: 'unrelated' } });
  const bankMember = createClient(endpoint, { auth: { token: 'bankMember' } });
  const inactiveDonor = createClient(endpoint, { auth: { token: 'inactiveDonor' } });
  t.after(async () => {
    donor.disconnect();
    unrelatedDonor.disconnect();
    bankMember.disconnect();
    inactiveDonor.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  const waitForConnect = (socket: ReturnType<typeof createClient>) => new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  await Promise.all([
    waitForConnect(donor),
    waitForConnect(unrelatedDonor),
    waitForConnect(bankMember),
    waitForConnect(inactiveDonor),
  ]);
  const waitForChange = (socket: ReturnType<typeof createClient>) =>
    new Promise<unknown[]>((resolve) => socket.once('data:changed', (...args) => resolve(args)));
  const donorChange = waitForChange(donor);
  const unrelatedChange = waitForChange(unrelatedDonor);
  let bankChangeReceived = false;
  let inactiveDonorChangeReceived = false;
  bankMember.on('data:changed', () => { bankChangeReceived = true; });
  inactiveDonor.on('data:changed', () => { inactiveDonorChangeReceived = true; });

  hub.publish(
    { roles: [RolUsuario.DONANTE] },
    { type: 'product.deleted', resource: 'products', resourceId: 503 },
  );
  const [[donorEvent], [unrelatedEvent]] = await Promise.all([donorChange, unrelatedChange]);
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal((donorEvent as { type: string }).type, 'product.deleted');
  assert.equal((unrelatedEvent as { resourceId: number }).resourceId, 503);
  assert.equal(bankChangeReceived, false);
  assert.equal(inactiveDonorChangeReceived, false);
});

test('coverage changes reach beneficiaries in the matching coverage only', async (t) => {
  const httpServer = createServer();
  const { io, hub } = createRealtimeSocketServer(httpServer, async (token) => {
    const identity = identities[token];
    if (!identity) throw new AppError('Invalid token', 401);
    return identity;
  });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address() as AddressInfo;
  const endpoint = `http://127.0.0.1:${address.port}`;
  const beneficiary = createClient(endpoint, { auth: { token: 'beneficiary' } });
  const otherBeneficiary = createClient(endpoint, { auth: { token: 'otherBeneficiary' } });
  t.after(async () => {
    beneficiary.disconnect();
    otherBeneficiary.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  const waitForConnect = (socket: ReturnType<typeof createClient>) => new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  await Promise.all([waitForConnect(beneficiary), waitForConnect(otherBeneficiary)]);
  const change = new Promise<unknown[]>((resolve) => {
    beneficiary.once('data:changed', (...args) => resolve(args));
  });
  let unrelatedChangeReceived = false;
  otherBeneficiary.on('data:changed', () => { unrelatedChangeReceived = true; });

  hub.publish(
    { coverageRooms: [coverageRoom('Cauca', 'Popayán')] },
    { type: 'inventory.updated', resource: 'availability', resourceId: 42 },
  );
  const [event] = await change;
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal((event as { resource: string }).resource, 'availability');
  assert.equal(unrelatedChangeReceived, false);
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
