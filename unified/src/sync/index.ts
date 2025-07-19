// Sync module exports
export { syncWorker } from './worker';

export async function startSyncWorker() {
  const { syncWorker } = await import('./worker');
  return syncWorker.start();
}