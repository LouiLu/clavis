import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the portal shell component', () => {
    expect(App()).toBeDefined();
  });
});
