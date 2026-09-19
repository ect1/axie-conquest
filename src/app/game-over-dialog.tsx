"use client";

import React from 'react';

type GameOverDialogProps = {
  portalLevel: number;
  unitsProduced: number;
  score: number;
  maxHealth: number;
  onRestart: () => void;
  onClose: () => void;
};

export default function GameOverDialog({
  portalLevel,
  unitsProduced,
  score,
  maxHealth,
  onRestart,
  onClose,
}: GameOverDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-over-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(7, 5, 14, 0.88)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '16px',
        animation: 'fadeIn 0.3s ease-out',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #1e1329 0%, #110d19 100%)',
          border: '2px solid rgba(239, 68, 68, 0.65)',
          borderRadius: '24px',
          boxShadow: '0 0 60px rgba(239, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          maxWidth: '460px',
          width: '100%',
          padding: '32px 28px',
          color: '#f8fafc',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        {/* Defeat Crest Icon */}
        <div
          style={{
            width: '76px',
            height: '76px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(239, 68, 68, 0.28) 0%, rgba(20, 10, 30, 0.8) 100%)',
            border: '2px solid #ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '36px',
            margin: '0 auto 18px',
            boxShadow: '0 0 25px rgba(239, 68, 68, 0.45)',
          }}
        >
          ⚔️💥
        </div>

        {/* Title & Badge */}
        <div
          style={{
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: '#f87171',
            marginBottom: '6px',
          }}
        >
          Settlement Base Destroyed
        </div>
        <h2
          id="game-over-title"
          style={{
            fontSize: '30px',
            fontWeight: 900,
            letterSpacing: '-0.5px',
            margin: '0 0 8px',
            color: '#ffffff',
            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}
        >
          GAME OVER
        </h2>
        <p
          style={{
            fontSize: '14px',
            color: '#94a3b8',
            lineHeight: 1.5,
            margin: '0 0 24px',
          }}
        >
          Hostile rift creatures overwhelmed your defenders and demolished Everleaf Haven.
        </p>

        {/* Score & Stats Card */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '18px 20px',
            marginBottom: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              paddingBottom: '10px',
            }}
          >
            <span style={{ color: '#cbd5e1', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🌀</span> Portal Wave Reached:
            </span>
            <strong style={{ fontSize: '16px', color: '#c084fc' }}>
              Level {portalLevel}
            </strong>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              paddingBottom: '10px',
            }}
          >
            <span style={{ color: '#cbd5e1', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚔️</span> Units Produced:
            </span>
            <strong style={{ fontSize: '16px', color: '#38bdf8' }}>
              {unitsProduced} Units
            </strong>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '2px',
            }}
          >
            <span style={{ color: '#f8fafc', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🏆</span> Final Defense Score:
            </span>
            <strong
              style={{
                fontSize: '20px',
                fontWeight: 900,
                color: '#facc15',
                textShadow: '0 0 12px rgba(250, 204, 21, 0.4)',
              }}
            >
              {score.toLocaleString()}
            </strong>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            type="button"
            onClick={() => onRestart()}
            style={{
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              padding: '14px 20px',
              fontSize: '15px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(34, 197, 94, 0.35)',
              transition: 'transform 0.15s ease, filter 0.15s ease',
            }}
            onMouseOver={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
            onMouseOut={e => (e.currentTarget.style.filter = 'brightness(1)')}
          >
            🔄 Restart Settlement (Reset Game)
          </button>

          <button
            type="button"
            onClick={() => onClose()}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#94a3b8',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onMouseOver={e => (e.currentTarget.style.color = '#ffffff')}
            onMouseOut={e => (e.currentTarget.style.color = '#94a3b8')}
          >
            🔍 Inspect Base Ruins
          </button>
        </div>
      </div>
    </div>
  );
}
