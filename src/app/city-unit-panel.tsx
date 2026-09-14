"use client";
import { useState } from 'react';
import { CityResourceKind, CityState } from '@/game/cities';
import { TROOP_DEFINITIONS } from '@/game/base';
import { ApiAxie } from '@/game/axie-roster';

type Props = { city: CityState; axies: readonly ApiAxie[]; onClose: () => void };
const resources: { kind: CityResourceKind; label: string; icon: string }[] = [{ kind: 'food', label: 'Provisions', icon: '🌾' }, { kind: 'wood', label: 'Timber', icon: '🪵' }, { kind: 'stone', label: 'Stone', icon: '⛏' }, { kind: 'warSupplies', label: 'War supplies', icon: '◈' }];

export default function CityUnitPanel({ city, axies, onClose }: Props) {
  const [tab, setTab] = useState<'resources' | 'military' | 'axies'>('resources');
  const stationed = axies.filter(axie => city.deployedAxieIds.includes(axie.id));
  return <section className="city-unit panel" aria-label={`${city.name} city unit`}><div className="catalog-heading"><div><span className="eyebrow">SELECTED CITY / {city.kind}</span><h2>{city.name}</h2><small>Independent stores, garrison, and stationed Axies.</small></div><button className="close" onClick={onClose} aria-label="Close city">&times;</button></div><div className="city-tabs" role="tablist">{(['resources', 'military', 'axies'] as const).map(item => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div>{tab === 'resources' && <div className="city-list">{resources.map(({ kind, label, icon }) => { const item = city.resources[kind], pct = item.capacity ? Math.round(item.amount / item.capacity * 100) : 0; return <div className="city-stock" key={kind}><span>{icon}</span><div><strong>{label}</strong><small>{item.amount.toLocaleString()} / {item.capacity.toLocaleString()}</small><i><b style={{ width: `${pct}%` }} /></i></div><em>{pct}%</em></div>; })}</div>}{tab === 'military' && <div className="city-list">{Object.entries(TROOP_DEFINITIONS).map(([kind, definition]) => <div className="city-stock" key={kind}><span>{definition.icon}</span><div><strong>{definition.name}</strong><small>Stationed in {city.name}</small></div><em>{city.troops[kind as keyof typeof city.troops]}</em></div>)}</div>}{tab === 'axies' && <div className="city-list">{stationed.map(axie => <div className="city-axie" key={axie.id}><span>{axie.name.slice(0, 1)}</span><div><strong>{axie.name}</strong><small>{axie.class} · stationed here</small></div></div>)}{!stationed.length && <p className="city-note">No Axies are stationed in this city.</p>}</div>}</section>;
}
