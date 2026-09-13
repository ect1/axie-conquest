import { useState } from 'react';
import { resetGame } from '@/game/reset';

export default function ResetGameControl() {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  function confirmReset() {
    try {
      resetGame(window.localStorage);
      window.location.reload();
    } catch {
      setError('Reset could not finish. Some saves may already be cleared. Check browser storage access and retry.');
    }
  }
  return <section className="reset-game" aria-label="Reset game">
    <h3>Start from scratch</h3>
    {confirming ? <>
      <p>Delete all saved buildings, marches, generated resources, trained units, military assignments, city data and developer settings? This cannot be undone. The game will reload with starter defaults and a newly generated world.</p>
      <div className="placement-actions"><button className="secondary" onClick={() => { setConfirming(false); setError(''); }}>Cancel</button><button className="primary" onClick={confirmReset}>Delete saves and restart</button></div>
    </> : <button className="secondary" onClick={() => setConfirming(true)}>Reset game</button>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
