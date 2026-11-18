import { getStore } from '@netlify/blobs';
import { normalizeEnv } from '../../server/api.mjs';
import { createLoopy } from '../../server/loopy.mjs';
import { flushWalletEvents } from '../../server/wallet-dispatch.mjs';

// A low-frequency recovery pass for acknowledged pending work only. Unknown
// provider writes remain blocked; this is never permission to issue twice.
export default async function handler() {
  const config=normalizeEnv();
  if(!config.enabled||!config.walletEnabled)return;
  const store=getStore({name:'clinime-private-v1',consistency:'strong'});
  const loopy=createLoopy({store,config:config.loopyConfig,timeoutMs:8000,writeTimeoutMs:20_000,deadlineAt:Date.now()+27_000});
  await flushWalletEvents({store,loopy,limit:8,budgetMs:10_000});
}
export const config={schedule:'0 * * * *'};
