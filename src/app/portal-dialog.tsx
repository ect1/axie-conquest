import { formatDuration } from '@/game/routes';
import type { PortalInstance, PortalMobSummoningConfig } from '@/game/portal';

type Props = {
  portal: PortalInstance;
  config: PortalMobSummoningConfig;
  now: number;
  onClose: () => void;
  onTriggerWave?: (portalId: string) => void;
  onTogglePause?: () => void;
  onAttackPortal?: (portal: PortalInstance) => void;
};

export default function PortalDialog({ portal, config, now, onClose, onTriggerWave, onTogglePause, onAttackPortal }: Props) {
  const remainingMs = Math.max(0, portal.nextAttackTime - now);
  const form = portal.upcomingFormation;

  // Group slots by row for formation grid display (Row 2 = Front, Row 1 = Mid, Row 0 = Rear)
  const rows = [2, 1, 0];
  const columns = [0, 1, 2, 3, 4];

  const getSlot = (row: number, col: number) => {
    return form.slots.find(s => s.row === row && s.column === col);
  };

  const isPaused = !!config.paused;
  const isWaveActive = portal.cycleState === 'active_wave';
  const isExhausted = portal.cycleState === 'exhausted';
  const isDisabled = portal.cycleState === 'disabled';

  return (
    <aside
      className="portal-dialog panel"
      style={{
        position: 'absolute',
        top: 'calc(var(--top) + 58px)',
        right: 'var(--edge-right)',
        bottom: 'auto',
        left: 'auto',
        marginInline: 0,
        marginLeft: 'auto',
        marginRight: 0,
        width: 'min(390px, 94vw)',
        maxHeight: 'calc(100dvh - var(--top) - var(--bottom) - 75px)',
        overflowY: 'auto',
        zIndex: 25,
        background: 'rgba(22, 16, 36, 0.94)',
        border: '1.5px solid #a855f7',
        boxShadow: '0 8px 32px rgba(88, 28, 135, 0.35)',
        color: '#f3e8ff',
        borderRadius: '16px',
        padding: '14px',
        pointerEvents: 'auto',
      }}
      aria-label="Portal Details"
    >
      {/* Header */}
      <div className="catalog-heading" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div>
          <span className="eyebrow" style={{ color: '#c084fc', letterSpacing: '1px', fontSize: '10px', display: 'block', fontWeight: 800 }}>
            LUNACIAN VOID RIFT
          </span>
          <h2 style={{ color: '#ffffff', font: 'bold 18px Georgia, serif', margin: '2px 0 0' }}>
            🌀 {portal.name}
          </h2>
          <small style={{ color: '#d8b4fe', fontSize: '11px', display: 'block', marginTop: '2px' }}>
            Level {portal.level} · Pos {portal.coordinate.x.toFixed(1)}, {portal.coordinate.z.toFixed(1)}
          </small>
        </div>
        <button
          className="close"
          onClick={onClose}
          aria-label="Close portal dialog"
          style={{
            background: 'rgba(59, 7, 100, 0.7)',
            color: '#f3e8ff',
            border: '1px solid #7e22ce',
            borderRadius: '10px',
            width: '36px',
            height: '36px',
            fontSize: '20px',
            cursor: 'pointer',
          }}
        >
          &times;
        </button>
      </div>

      {/* Cycle Status Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderRadius: '10px',
          background: isDisabled || isPaused
            ? 'rgba(71, 85, 105, 0.3)'
            : isWaveActive
            ? 'rgba(220, 38, 38, 0.3)'
            : isExhausted
            ? 'rgba(217, 119, 6, 0.25)'
            : 'rgba(185, 28, 28, 0.25)',
          border: `1px solid ${
            isDisabled || isPaused ? '#64748b' : isWaveActive ? '#ef4444' : isExhausted ? '#f59e0b' : '#ef4444'
          }`,
          marginBottom: isWaveActive ? '6px' : '14px',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: isDisabled || isPaused ? '#94a3b8' : isWaveActive ? '#fca5a5' : isExhausted ? '#fbbf24' : '#f87171',
          }}
        >
          {isDisabled
            ? '⏸️ SUMMONING DISABLED'
            : isPaused
            ? '⏸️ RESPAWN PAUSED'
            : isWaveActive
            ? '⚔️ WAVE IN PROGRESS'
            : isExhausted
            ? '⏳ RESTING (EXHAUSTED)'
            : '⚔️ INCOMING ATTACK WAVE'}
        </span>
        <strong style={{ fontSize: '13px', color: '#ffffff' }}>
          {isDisabled
            ? 'Disabled'
            : isPaused
            ? 'Paused'
            : isWaveActive
            ? 'Marching'
            : formatDuration(remainingMs)}
        </strong>
      </div>
      {isWaveActive && (
        <small style={{ color: '#fca5a5', display: 'block', fontSize: '11px', marginBottom: '12px' }}>
          ⚔️ Mobs are active on the map. Next wave prepares after mobs are defeated or gone.
        </small>
      )}

      {/* Composition Summary Badges */}
      <div style={{ marginBottom: '14px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#e9d5ff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Next Wave Composition
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '6px' }}>
          <div style={{ background: 'rgba(131, 24, 67, 0.35)', border: '1px solid #db2777', borderRadius: '8px', padding: '6px 8px', textAlign: 'center' }}>
            <span style={{ fontSize: '10px', color: '#fbcfe8', display: 'block' }}>👑 Boss Mascot</span>
            <strong style={{ fontSize: '16px', color: '#ffffff' }}>{form.totalMascot}</strong>
          </div>
          <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid #64748b', borderRadius: '8px', padding: '6px 8px', textAlign: 'center' }}>
            <span style={{ fontSize: '10px', color: '#cbd5e1', display: 'block' }}>⚔️ Soldiers</span>
            <strong style={{ fontSize: '16px', color: '#ffffff' }}>{form.totalSoldier}</strong>
          </div>
          <div style={{ background: 'rgba(20, 83, 45, 0.35)', border: '1px solid #16a34a', borderRadius: '8px', padding: '6px 8px', textAlign: 'center' }}>
            <span style={{ fontSize: '10px', color: '#bbf7d0', display: 'block' }}>🏹 Archers</span>
            <strong style={{ fontSize: '16px', color: '#ffffff' }}>{form.totalArcher}</strong>
          </div>
        </div>
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#c084fc', textAlign: 'right' }}>
          Total forces: <strong>{form.totalMobs}</strong> mobs
        </div>
      </div>

      {/* Tactical Formation Distribution Grid */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#e9d5ff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Formation Distribution
          </span>
          <small style={{ color: '#a855f7', fontSize: '10px' }}>Randomized Slots & Quantities</small>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateRows: 'repeat(3, 1fr)',
            gap: '4px',
            background: 'rgba(15, 10, 25, 0.7)',
            padding: '8px',
            borderRadius: '10px',
            border: '1px solid #4c1d95',
          }}
        >
          {rows.map(row => (
            <div key={row} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
              {columns.map(col => {
                const slot = getSlot(row, col);
                const isMascot = slot?.kind === 'mascot';
                const isSoldier = slot?.kind === 'soldier';
                const isArcher = slot?.kind === 'archer';

                let bg = 'rgba(255, 255, 255, 0.03)';
                let border = 'rgba(255, 255, 255, 0.08)';
                let icon = '';

                if (isMascot) {
                  bg = 'rgba(236, 72, 153, 0.25)';
                  border = '#ec4899';
                  icon = '👑';
                } else if (isSoldier) {
                  bg = 'rgba(71, 85, 105, 0.35)';
                  border = '#94a3b8';
                  icon = '⚔️';
                } else if (isArcher) {
                  bg = 'rgba(34, 197, 94, 0.25)';
                  border = '#22c55e';
                  icon = '🏹';
                }

                return (
                  <div
                    key={col}
                    style={{
                      height: '42px',
                      background: bg,
                      border: `1px solid ${border}`,
                      borderRadius: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                    }}
                    title={slot ? `${slot.kind.toUpperCase()} squad: ${slot.count} units (Row ${row}, Col ${col})` : `Empty slot (Row ${row}, Col ${col})`}
                  >
                    {slot ? (
                      <>
                        <span style={{ fontSize: '13px', lineHeight: 1 }}>{icon}</span>
                        <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#fff' }}>
                          x{slot.count}
                        </span>
                      </>
                    ) : (
                      <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '9px' }}>·</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#94a3b8', marginTop: '4px' }}>
          <span>▲ Front (Vanguard)</span>
          <span>● Center (Mascot)</span>
          <span>▼ Rear (Archers)</span>
        </div>
      </div>

      {portal.defenderFormation && (
        <div style={{ marginBottom: '14px', background: 'rgba(24, 18, 38, 0.7)', border: '1px solid #7c3aed', borderRadius: '10px', padding: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              🛡️ Portal Defenders (Destroyable)
            </span>
            <small style={{ color: '#a78bfa', fontSize: '10px' }}>Matches Respawn Formation</small>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '4px' }}>
            <div style={{ background: 'rgba(131, 24, 67, 0.25)', border: '1px solid #db2777', borderRadius: '6px', padding: '4px', textAlign: 'center' }}>
              <span style={{ fontSize: '9px', color: '#fbcfe8', display: 'block' }}>👑 Mascots</span>
              <strong style={{ fontSize: '13px', color: '#ffffff' }}>{portal.defenderFormation.totalMascot}</strong>
            </div>
            <div style={{ background: 'rgba(30, 41, 59, 0.4)', border: '1px solid #64748b', borderRadius: '6px', padding: '4px', textAlign: 'center' }}>
              <span style={{ fontSize: '9px', color: '#cbd5e1', display: 'block' }}>⚔️ Soldiers</span>
              <strong style={{ fontSize: '13px', color: '#ffffff' }}>{portal.defenderFormation.totalSoldier}</strong>
            </div>
            <div style={{ background: 'rgba(20, 83, 45, 0.25)', border: '1px solid #16a34a', borderRadius: '6px', padding: '4px', textAlign: 'center' }}>
              <span style={{ fontSize: '9px', color: '#bbf7d0', display: 'block' }}>🏹 Archers</span>
              <strong style={{ fontSize: '13px', color: '#ffffff' }}>{portal.defenderFormation.totalArcher}</strong>
            </div>
          </div>
          <small style={{ display: 'block', color: '#c4b5fd', fontSize: '10px', marginTop: '6px' }}>
            Total defending garrison: <strong>{portal.defenderFormation.totalMobs}</strong> mobs guarding the portal structure.
          </small>
        </div>
      )}

      {/* Current Level Scaled Stats */}
      <div style={{ marginBottom: '14px', background: 'rgba(30, 20, 48, 0.6)', padding: '8px 10px', borderRadius: '8px', border: '1px solid #581c87' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
          Level {portal.level} Combat Multipliers
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', fontSize: '10px' }}>
          <div>
            <strong style={{ color: '#f472b6', display: 'block' }}>Mascot</strong>
            <span>HP {form.slots.find(s => s.kind === 'mascot')?.stats.health ?? 150}</span><br />
            <span>ATK {form.slots.find(s => s.kind === 'mascot')?.stats.attack ?? 20}</span>
          </div>
          <div>
            <strong style={{ color: '#94a3b8', display: 'block' }}>Soldier</strong>
            <span>HP {form.slots.find(s => s.kind === 'soldier')?.stats.health ?? 220}</span><br />
            <span>ATK {form.slots.find(s => s.kind === 'soldier')?.stats.attack ?? 28}</span>
          </div>
          <div>
            <strong style={{ color: '#4ade80', display: 'block' }}>Archer</strong>
            <span>HP {form.slots.find(s => s.kind === 'archer')?.stats.health ?? 110}</span><br />
            <span>ATK {form.slots.find(s => s.kind === 'archer')?.stats.attack ?? 35}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
        {config.portalLevelScaling.subPortal?.destroyable && portal.id !== 'portal-prime' && onAttackPortal && (
          <button
            className="primary"
            onClick={() => onAttackPortal(portal)}
            style={{
              flex: '1 1 100%',
              background: '#b91c1c',
              borderColor: '#ef4444',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '10px 8px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              marginBottom: '4px',
            }}
          >
            ⚔️ Attack Sub-portal (Destroy)
          </button>
        )}
        {onTogglePause && (
          <button
            onClick={onTogglePause}
            style={{
              flex: 1,
              background: config.paused ? 'rgba(22, 101, 52, 0.7)' : 'rgba(51, 65, 85, 0.7)',
              color: config.paused ? '#bbf7d0' : '#e2e8f0',
              border: `1px solid ${config.paused ? '#22c55e' : '#94a3b8'}`,
              borderRadius: '8px',
              padding: '8px',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            {config.paused ? '▶️ Resume' : '⏸️ Pause'}
          </button>
        )}
        {onTriggerWave && (
          <button
            className="primary"
            onClick={() => onTriggerWave(portal.id)}
            style={{
              flex: 1,
              background: '#9333ea',
              color: '#fff',
              border: '1px solid #c084fc',
              borderRadius: '8px',
              padding: '8px',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            ⚡ Trigger
          </button>
        )}
        <button
          className="secondary"
          onClick={onClose}
          style={{
            flex: 1,
            background: 'rgba(59, 7, 100, 0.6)',
            color: '#e9d5ff',
            border: '1px solid #7e22ce',
            borderRadius: '8px',
            padding: '8px',
            fontSize: '11px',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </aside>
  );
}
