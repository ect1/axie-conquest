"use client";

import { useEffect, useState } from 'react';
import { TrainingJob, jobProgress, secondsRemaining } from '@/game/training-queue';

const SIZE = 64;          // sprite diameter px
const STROKE = 5;         // ring stroke width
const R = (SIZE - STROKE * 2) / 2; // ring radius
const CIRCUMFERENCE = 2 * Math.PI * R;

type Props = {
  job: TrainingJob;
  /** Pixel position (screen coords) of the building top. */
  position: { x: number; y: number };
};

export default function BuildingCountdownSprite({ job, position }: Props) {
  const [now, setNow] = useState(Date.now);

  // Re-render every 200 ms to update the ring arc and timer label
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  const progress = jobProgress(job, now);  // 0 → 1
  const secs = secondsRemaining(job, now);
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const label = secs >= 60
    ? `${Math.ceil(secs / 60)}m`
    : `${secs}s`;

  const icon = job.kind === 'infantry' ? '⚔' : job.kind === 'archer' ? '🏹' : '🧭';

  return (
    <div
      className="training-sprite"
      style={{
        position: 'fixed',
        left: position.x - SIZE / 2,
        top: position.y - SIZE / 2,
        width: SIZE,
        height: SIZE,
        pointerEvents: 'none',
        zIndex: 300,
      }}
      aria-hidden="true"
    >
      {/* Background disc */}
      <svg width={SIZE} height={SIZE} style={{ position: 'absolute', inset: 0 }}>
        {/* Dark background circle */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="rgba(18, 28, 22, 0.82)"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
        />
        {/* Progress arc — starts at top (−90°) */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="#4cf09a"
          strokeWidth={STROKE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90, ${SIZE / 2}, ${SIZE / 2})`}
          style={{ transition: 'stroke-dashoffset 0.2s linear' }}
        />
      </svg>

      {/* Icon + timer stacked in the centre */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
      }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#c8ffd8',
          fontFamily: 'system-ui, sans-serif',
          letterSpacing: '-0.5px',
        }}>{label}</span>
      </div>
    </div>
  );
}
