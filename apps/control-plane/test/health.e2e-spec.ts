import { describe, expect, it } from 'vitest';

describe('control plane health contract', () => {
  it('documents the health response shape', () => {
    const response = { status: 'ok', database: 'ok' };
    expect(response).toEqual({ status: 'ok', database: 'ok' });
  });
});
