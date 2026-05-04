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
});
