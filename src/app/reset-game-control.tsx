import { useEffect, useRef, useState } from 'react';
import { resetGame } from '@/game/reset';

type ResetGameControlProps = {
  onBeforeReset?: () => void;
};

export default function ResetGameControl({ onBeforeReset }: ResetGameControlProps = {}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (confirming) {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [confirming]);

  function confirmReset() {
    try {
      onBeforeReset?.();
      resetGame(window.localStorage);
      window.location.reload();
    } catch {
      setError('Reset could not finish. Some saves may already be cleared. Check browser storage access and retry.');
    }
  }

  return (
    <section ref={containerRef} className="reset-game" aria-label="Reset game">
      <h3>Start from scratch</h3>
      {confirming ? (
        <>
          <p style={{ color: '#ffd166', fontWeight: 500, margin: '8px 0' }}>
            ⚠️ Confirmation required: Delete all saved buildings, marches, generated resources, trained units, military assignments, city data and developer settings? This cannot be undone.
          </p>
          <div className="placement-actions">
            <button
              className="secondary"
              onClick={() => {
                setConfirming(false);
                setError('');
              }}
            >
              Cancel
            </button>
            <button
              className="primary"
              style={{ background: '#e04040', borderColor: '#ff6060', fontWeight: 'bold' }}
              onClick={confirmReset}
            >
              Delete saves and restart
            </button>
          </div>
        </>
      ) : (
        <button className="secondary" onClick={() => setConfirming(true)}>
          Reset game
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

