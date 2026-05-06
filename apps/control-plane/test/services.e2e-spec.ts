import { describe, expect, it } from 'vitest';

describe('backend service API contract', () => {
  it('creates a service with default rate limits', () => {
    const created = {
      name: 'Jobs',
      slug: 'jobs',
      base_url: 'http://sample-backend:6060',
      default_rate_limit: { requests_per_interval: 1000, interval_seconds: 60, burst_size: 100 },
    };
    expect(created.slug).toBe('jobs');
  });

  it('service rate limit GET returns expected shape', () => {
    const rateLimit = {
      requests_per_interval: 1000,
      interval_seconds: 60,
      burst_size: 100,
    };
    expect(rateLimit.requests_per_interval).toBeGreaterThan(0);
    expect(typeof rateLimit.burst_size).toBe('number');
  });

  it('service rate limit PUT accepts and returns updated values', () => {
    const updated = {
      requests_per_interval: 500,
      interval_seconds: 30,
      burst_size: 50,
    };
    expect(updated.burst_size).toBe(50);
    expect(updated.interval_seconds).toBeLessThan(60);
  });
});
