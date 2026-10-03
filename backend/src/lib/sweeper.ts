import { getDb } from '../db/connection.js';
import { finaliseOverdue } from './finalise.js';

// Submits attempts whose time ran out even if the student's browser is long gone.
export function startSweeper(intervalMs = 30_000): () => void {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const n = await finaliseOverdue(getDb(), new Date());
      if (n > 0) console.log(`sweeper: submitted ${n} timed-out attempt(s)`);
    } catch (err) {
      console.error('sweeper failed', err);
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
