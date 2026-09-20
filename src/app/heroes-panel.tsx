"use client";

import { useState } from 'react';
import { ApiAxie } from '@/game/axie-roster';
import AxieModelInspector from './axie-model-inspector';

type Props = { healthById: Readonly<Record<string, number>>; axies: readonly ApiAxie[]; deployedIds: readonly string[]; status: 'loading' | 'ready' | 'error'; error: string; syncedAt: number | null; onDeploy: (id: string) => void; onEnlist: (id: string) => void; onClose: () => void };

function AxieHealth({ ratio = 1 }: { ratio?: number }) {
  const value = Math.max(0, Math.min(1, ratio));
  const percent = value < 1 ? Math.floor(value * 100) : 100;
  return <span className="town-axie-health">
    <span>{value === 0 ? 'Knocked out' : value < 1 ? 'Wounded' : 'Healthy'} · {percent}% HP</span>
    <progress max={1} value={value} aria-label="Axie health" />
  </span>;
}

function Portrait({ axie }: { axie: ApiAxie }) { return <span className="api-axie-fallback" aria-hidden="true">{axie.name.slice(0, 1)}</span>; }

export default function HeroesPanel({ healthById, axies, deployedIds, status, error, syncedAt, onDeploy, onEnlist, onClose }: Props) {
  const [tab, setTab] = useState<'active' | 'deployed'>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const deployed = axies.filter(axie => deployedIds.includes(axie.id));
  const selected = axies.find(axie => axie.id === selectedId);
  const items = tab === 'active' ? axies : deployed;
  return <section className="heroes panel" aria-label="Axie heroes">
    <div className="catalog-heading"><div><h2>Axie heroes</h2><small>{status === 'loading' ? 'Syncing your Ronin Axies…' : `${axies.length} owned · ${deployed.length} deployed in town`}</small></div><button className="close" aria-label="Close Axie heroes" onClick={onClose}>&times;</button></div>
    <div className="axie-tabs" role="tablist" aria-label="Axie collections"><button role="tab" aria-selected={tab === 'active'} onClick={() => { setTab('active'); setSelectedId(null); }}>Active</button><button role="tab" aria-selected={tab === 'deployed'} onClick={() => { setTab('deployed'); setSelectedId(null); }}>Deployed in Town</button></div>
    {status === 'loading' && !axies.length && <div className="empty-state"><strong>Loading Axies…</strong><p>Fetching this wallet's Axies from Sky Mavis.</p></div>}
    {status === 'error' && !axies.length && <div className="empty-state"><span className="empty-state-icon" aria-hidden="true">!</span><strong>Could not sync Axies</strong><p>{error}</p></div>}
    {!!selected && <div className="hero-detail"><button className="secondary" onClick={() => setSelectedId(null)}>Back to {tab === 'active' ? 'active' : 'deployed'} Axies</button><AxieModelInspector axie={selected} /><h3>{selected.name}</h3>{deployedIds.includes(selected.id) && <AxieHealth ratio={healthById[selected.id]} />}<p className="hero-class">{selected.class} · #{selected.id}</p><div className="hero-section"><h4>Parts</h4><div className="part-grid">{selected.parts.map(part => <div className="part-item" key={part.id}><small>{part.type}</small><strong>{part.name}</strong></div>)}</div></div>{deployedIds.includes(selected.id) ? <button className="secondary hero-deploy" onClick={() => { onEnlist(selected.id); setTab('active'); setSelectedId(null); }}>Enlist Axie</button> : <button className="primary hero-deploy" onClick={() => { onDeploy(selected.id); setTab('deployed'); setSelectedId(null); }}>Assign to town</button>}</div>}
    {!selected && !!items.length && <><div className="owned-axies-heading"><strong>{tab === 'active' ? 'Active Axies' : 'Deployed in Town'}</strong><small>{syncedAt ? `Synced ${new Date(syncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Saved roster'}</small></div><div className="hero-roster">{items.map(axie => <button className="hero-card" key={axie.id} onClick={() => setSelectedId(axie.id)} aria-label={`View ${axie.name}`}><Portrait axie={axie} /><strong>{axie.name}</strong><span>{axie.class}</span>{tab === 'deployed' && <AxieHealth ratio={healthById[axie.id]} />}<small>{axie.parts.map(part => part.name).join(' · ')}</small>{deployedIds.includes(axie.id) && <span className="deployment-ribbon">DEPLOYED</span>}</button>)}</div></>}
    {!selected && status === 'ready' && !items.length && <div className="empty-state"><span className="empty-state-icon" aria-hidden="true">◈</span><strong>{tab === 'active' ? 'No owned Axies' : 'No Axies deployed in town'}</strong><p>{tab === 'active' ? 'This wallet has no Axies available through the API.' : 'Assign an Axie from the Active tab to station it in your city.'}</p></div>}
    {status === 'error' && !!axies.length && <p className="city-note" role="status">Showing your last synced roster. {error}</p>}
  </section>;
}
