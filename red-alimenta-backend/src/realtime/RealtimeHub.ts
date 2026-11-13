import { randomUUID } from 'node:crypto';
import { RolUsuario } from '@prisma/client';
import type { Server } from 'socket.io';

export interface RealtimeIdentity {
  userId: number;
  sessionId: string;
  role: RolUsuario;
  accountStatus: string;
  bankIds: number[];
  beneficiaryCoverage?: { departamento: string; municipio: string } | null;
}

export interface RealtimeRecipients {
  userIds?: number[];
  bankIds?: number[];
  roles?: RolUsuario[];
  coverageRooms?: string[];
}

export interface RealtimeChange {
  eventId: string;
  type: string;
  resource: string;
  resourceId: number;
  occurredAt: string;
}

export function userRoom(userId: number): string {
  return `user:${userId}`;
}

export function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

export function bankRoom(bankId: number): string {
  return `bank:${bankId}`;
}

export function roleRoom(role: RolUsuario): string {
  return `role:${role}`;
}

export function coverageRoom(departamento: string, municipio: string): string {
  const normalize = (value: string) => encodeURIComponent(value.trim().toLocaleLowerCase('es-CO'));
  return `coverage:${normalize(departamento)}:${normalize(municipio)}`;
}

export function recipientRooms(recipients: RealtimeRecipients): string[] {
  return [...new Set([
    ...(recipients.userIds ?? []).map(userRoom),
    ...(recipients.bankIds ?? []).map(bankRoom),
    ...(recipients.roles ?? []).map(roleRoom),
    ...(recipients.coverageRooms ?? []),
  ])];
}

export class RealtimeHub {
  constructor(private readonly io: Server) {}

  publish(
    recipients: RealtimeRecipients,
    change: Omit<RealtimeChange, 'eventId' | 'occurredAt'>,
  ): void {
    const rooms = recipientRooms(recipients);
    if (rooms.length === 0) return;

    this.io.to(rooms).emit('data:changed', {
      ...change,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
    } satisfies RealtimeChange);
  }

  disconnectUser(userId: number): void {
    this.io.in(userRoom(userId)).disconnectSockets(true);
  }

  disconnectSession(sessionId: string): void {
    this.io.in(sessionRoom(sessionId)).disconnectSockets(true);
  }

  removeUserFromBank(userId: number, bankId: number): void {
    this.io.in(userRoom(userId)).socketsLeave(bankRoom(bankId));
  }
}

let activeHub: RealtimeHub | undefined;

export function setRealtimeHub(hub: RealtimeHub): void {
  activeHub = hub;
}

export function publishRealtimeChange(
  recipients: RealtimeRecipients,
  change: Omit<RealtimeChange, 'eventId' | 'occurredAt'>,
): void {
  activeHub?.publish(recipients, change);
}

export function disconnectRealtimeUser(userId: number): void {
  activeHub?.disconnectUser(userId);
}

export function disconnectRealtimeSession(sessionId: string): void {
  activeHub?.disconnectSession(sessionId);
}

export function removeRealtimeUserFromBank(userId: number, bankId: number): void {
  activeHub?.removeUserFromBank(userId, bankId);
}
