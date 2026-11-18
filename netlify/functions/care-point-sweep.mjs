import { getStore } from '@netlify/blobs';
import { createCarePoint } from '../../server/care-point.mjs';

// Riyadh Sunday midnight is Saturday 21:00 UTC. Freeze only: a human owner
// must resolve any tie and explicitly approve the single wallet prize.
export default async function handler() {
  const store = getStore({ name: 'clinime-private-v1', consistency: 'strong' });
  await createCarePoint({ store, secret: process.env.APP_SECRET || '' }).sweep();
}
export const config = { schedule: '0 21 * * 6' };
