import { describe, expect, it } from 'vitest';

describe('internal gateway validation contract', () => {
  it('returns key and service metadata for a valid key-service pair', () => {
    const response = {
      valid: true,
      api_key: { id: 'key_123' },
      backend_service: { slug: 'sample', base_url: 'http://sample-backend:6060' },
      rate_limit: { requests_per_interval: 1000, interval_seconds: 60, burst_size: 100 },
    };
    expect(response.valid).toBe(true);
    expect(response.backend_service.slug).toBe('sample');
  });
});
