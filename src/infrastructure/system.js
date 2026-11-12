import { randomUUID } from 'node:crypto';

/** Implementações reais das portas Clock e IdGenerator. */
export const systemClock = { now: () => new Date() };
export const uuidGenerator = { newId: () => randomUUID() };
