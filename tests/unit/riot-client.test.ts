import { describe, it, expect } from 'vitest';
import { RateLimiter } from '@/server/riot/rate-limiter';

function createFakeClock(initialMs = 1_000_000) {
  let currentMs = initialMs;
  const sleeps: number[] = [];
  return {
    now: () => currentMs,
    advance: (ms: number) => {
      currentMs += ms;
    },
    sleep: async (ms: number) => {
      sleeps.push(ms);
      currentMs += ms;
    },
    sleeps,
  };
}

describe('RateLimiter and RiotClient', () => {
  it('RIOT-01 enforces 20 req/1s and 100 req/2min per routing and queues excess', async () => {
    const clock = createFakeClock();
    const limiter = new RateLimiter({
      now: clock.now,
      sleep: clock.sleep,
    });

    const timestamps: number[] = [];
    for (let i = 0; i < 25; i++) {
      await limiter.acquire('br1');
      timestamps.push(clock.now());
    }

    // First 20 requests happen immediately in window 1 (t = 1_000_000)
    expect(timestamps.slice(0, 20).every((t) => t === 1_000_000)).toBe(true);
    // 21st..25th requests are queued into the next 1s window (t >= 1_001_000)
    expect(timestamps[20]).toBe(1_001_000);
    expect(timestamps[24]).toBe(1_001_000);

    // Exhaust up to 100 requests across 1s windows
    for (let i = 25; i < 100; i++) {
      await limiter.acquire('br1');
      timestamps.push(clock.now());
    }
    expect(timestamps).toHaveLength(100);
    // 100th request occurred at 4s mark (5 windows of 20)
    expect(timestamps[99]).toBe(1_004_000);

    // 101st request must wait until 120s (120_000 ms) from the 1st request
    await limiter.acquire('br1');
    expect(clock.now()).toBe(1_120_000);
  });

  it('isolates rate limit buckets per routing value', async () => {
    const clock = createFakeClock();
    const limiter = new RateLimiter({
      now: clock.now,
      sleep: clock.sleep,
    });

    for (let i = 0; i < 20; i++) {
      await limiter.acquire('americas');
    }
    // 'europe' has its own bucket and does not sleep
    await limiter.acquire('europe');
    expect(clock.sleeps).toHaveLength(0);
  });

  it('pauses subsequent requests on a routing value when pause() is called', async () => {
    const clock = createFakeClock();
    const limiter = new RateLimiter({
      now: clock.now,
      sleep: clock.sleep,
    });

    await limiter.pause('br1', 3000);
    await limiter.acquire('br1');
    expect(clock.now()).toBe(1_003_000);
    expect(clock.sleeps).toEqual([3000]);
  });
});
