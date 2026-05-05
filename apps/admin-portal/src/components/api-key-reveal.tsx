import { useState } from 'react';

interface ApiKeyRevealProps {
  apiKey: string;
  onDone: () => void;
}

export function ApiKeyReveal({ apiKey, onDone }: ApiKeyRevealProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
    } catch {
      // Clipboard API unavailable; key is still visible for manual copy.
    }
  };

  return (
    <div className="key-reveal">
      <p className="key-warning">
        Copy this key now. You won't be able to see it again.
      </p>
      <div className="key-value">{apiKey}</div>
      <div className="flex-row">
        <button className="btn-primary" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </button>
        <button className="btn-secondary" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
