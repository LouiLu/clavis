import { useState } from 'react';

export interface RateLimitValues {
  requests_per_interval: number;
  interval_seconds: number;
  burst_size: number;
}

interface RateLimitFormProps {
  initial?: RateLimitValues | null;
  onSave: (values: RateLimitValues) => Promise<void>;
  onCancel: () => void;
  onRemove?: () => Promise<void>;
}

const DEFAULTS: RateLimitValues = {
  requests_per_interval: 1000,
  interval_seconds: 60,
  burst_size: 100,
};

export function RateLimitForm({ initial, onSave, onCancel, onRemove }: RateLimitFormProps) {
  const [values, setValues] = useState<RateLimitValues>(initial ?? DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const set = (field: keyof RateLimitValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((prev) => ({ ...prev, [field]: parseInt(e.target.value, 10) || 0 }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(values);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;
    setRemoving(true);
    try {
      await onRemove();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <form onSubmit={handleSave}>
      <div className="form-row" style={{ marginTop: 12 }}>
        <div className="form-group">
          <label htmlFor="rl-requests">Requests per interval</label>
          <input
            id="rl-requests"
            type="number"
            min={1}
            value={values.requests_per_interval}
            onChange={set('requests_per_interval')}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="rl-interval">Interval (seconds)</label>
          <input
            id="rl-interval"
            type="number"
            min={1}
            value={values.interval_seconds}
            onChange={set('interval_seconds')}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="rl-burst">Burst size</label>
          <input
            id="rl-burst"
            type="number"
            min={1}
            value={values.burst_size}
            onChange={set('burst_size')}
            required
          />
        </div>
      </div>
      <div className="flex-row" style={{ marginTop: 12 }}>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <><span className="spinner" /> Saving...</> : 'Save'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving || removing}>
          Cancel
        </button>
        {onRemove && (
          <button
            type="button"
            className="btn-secondary"
            onClick={handleRemove}
            disabled={removing || saving}
            style={{ color: '#991b1b' }}
          >
            {removing ? <><span className="spinner" /> Removing...</> : 'Reset to default'}
          </button>
        )}
      </div>
    </form>
  );
}
