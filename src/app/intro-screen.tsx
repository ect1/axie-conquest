'use client';

import React, { useState, useEffect } from 'react';
import {
  DEFAULT_OWNER,
  getPersistedOwner,
  setPersistedOwner,
  getActiveGameOwner,
  normalizeOwnerAddress,
  hasExistingGame,
} from '@/game/owner-address';

type IntroScreenProps = {
  onStartGame: (address: string) => void;
  onRestartGame: (address: string) => void;
};

export default function IntroScreen({ onStartGame, onRestartGame }: IntroScreenProps) {
  const [address, setAddress] = useState(DEFAULT_OWNER);
  const [activeOwner, setActiveOwner] = useState<string | null>(null);
  const [hasGame, setHasGame] = useState(false);
  const [confirmingRestart, setConfirmingRestart] = useState(false);

  useEffect(() => {
    const saved = getPersistedOwner();
    setAddress(saved);
    const existing = hasExistingGame();
    setHasGame(existing);
    const savedOwner = getActiveGameOwner();
    setActiveOwner(savedOwner);
  }, []);

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAddress(value);
    setPersistedOwner(value);
  };

  const normalizedCurrent = normalizeOwnerAddress(address).toLowerCase();
  const normalizedActive = activeOwner ? normalizeOwnerAddress(activeOwner).toLowerCase() : null;
  const isAddressChanged = Boolean(activeOwner && normalizedActive !== normalizedCurrent);

  const handleStart = () => {
    const finalAddress = normalizeOwnerAddress(address);
    setPersistedOwner(finalAddress);
    onStartGame(finalAddress);
  };

  const handleRestart = () => {
    const finalAddress = normalizeOwnerAddress(address);
    setPersistedOwner(finalAddress);
    onRestartGame(finalAddress);
  };

  const handleResetToDefault = () => {
    setAddress(DEFAULT_OWNER);
    setPersistedOwner(DEFAULT_OWNER);
  };

  return (
    <div className="intro-screen" role="dialog" aria-modal="true" aria-label="Axie Conquest Title Screen">
      <div className="intro-backdrop" />
      <div className="intro-card">
        <div className="intro-header">
          <div className="intro-crest" aria-hidden="true">✦</div>
          <span className="eyebrow intro-eyebrow">LUNACIA STRATEGY CONQUEST</span>
          <h1 className="intro-title">AXIE CONQUEST</h1>
          <p className="intro-tagline">Rebuild your Lunacian settlement, train armies, and command your Axie heroes across the realm.</p>
        </div>

        <div className="intro-section">
          <div className="intro-label-row">
            <label htmlFor="intro-wallet-address">
              <strong>Wallet / Owner Address</strong>
              <small>Fetches your Axie team from Sky Mavis</small>
            </label>
            {address !== DEFAULT_OWNER && (
              <button
                type="button"
                className="intro-reset-default"
                onClick={handleResetToDefault}
                title="Reset to default wallet address"
              >
                Reset Default
              </button>
            )}
          </div>

          <div className="intro-input-wrapper">
            <input
              id="intro-wallet-address"
              type="text"
              value={address}
              onChange={handleAddressChange}
              placeholder="0x... or ronin:..."
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          {isAddressChanged ? (
            <div className="intro-status-pill notice">
              <span>⚠️</span>
              <div>
                <strong>Wallet Address Changed</strong>
                <small>Starting will create a new settlement for this wallet.</small>
              </div>
            </div>
          ) : hasGame ? (
            <div className="intro-status-pill success">
              <span>✦</span>
              <div>
                <strong>Existing Settlement Ready</strong>
                <small>Game state saved for this wallet address.</small>
              </div>
            </div>
          ) : (
            <div className="intro-status-pill info">
              <span>🌱</span>
              <div>
                <strong>Fresh Realm Awaits</strong>
                <small>No active game found. Start to begin your conquest.</small>
              </div>
            </div>
          )}
        </div>

        {confirmingRestart ? (
          <div className="intro-confirm-restart">
            <p>
              <strong>Restart Confirmation</strong>
              <small>This will permanently wipe all current buildings, units, formations, and battle progress.</small>
            </p>
            <div className="intro-action-group">
              <button
                type="button"
                className="secondary intro-btn"
                onClick={() => setConfirmingRestart(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary intro-btn danger"
                onClick={handleRestart}
              >
                Confirm Restart
              </button>
            </div>
          </div>
        ) : (
          <div className="intro-action-group">
            <button
              type="button"
              className="primary intro-btn"
              onClick={handleStart}
            >
              <span>{hasGame && !isAddressChanged ? 'Continue Game' : 'Start Game'}</span>
            </button>

            <button
              type="button"
              className="secondary intro-btn"
              disabled={!hasGame}
              onClick={() => setConfirmingRestart(true)}
              title={hasGame ? 'Reset current settlement and start over' : 'No game loaded to restart'}
            >
              <span>Restart Game</span>
            </button>
          </div>
        )}

        <div className="intro-footer">
          <small>Axie Conquest · Mobile-First 4X RTS · Lunacian Homeland</small>
        </div>
      </div>
    </div>
  );
}
