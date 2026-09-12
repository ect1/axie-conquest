"use client";

import { useState } from 'react';
import { AXIE_CLASSES, AxieClass, STARTER_HEROES } from '@/game/heroes';

function AxiePortrait({ kind }: { kind: AxieClass }) {
  const style = AXIE_CLASSES[kind];
  return <svg className="axie-portrait" viewBox="0 0 100 80" aria-hidden="true">
    <ellipse cx="50" cy="72" rx="31" ry="5" fill="#294b38" opacity=".1" />
    <path d="M76 46 Q102 30 88 62 L73 64" fill={style.accent} />
    <ellipse cx="31" cy="66" rx="10" ry="7" fill={style.accent} />
    <ellipse cx="68" cy="66" rx="10" ry="7" fill={style.accent} />
    <path d="M25 35 Q9 7 31 18 L43 35 M58 34 Q73 4 80 22 L74 40" fill={style.accent} />
    <ellipse cx="50" cy="46" rx="34" ry="26" fill={style.color} stroke={style.accent} strokeWidth="2" />
    {kind === 'plant' ? <path d="M47 26 Q30 1 56 10 Q73 6 58 26" fill={style.accent} />
      : kind === 'bug' ? <g stroke={style.accent} strokeWidth="3" fill={style.accent}><path d="M39 25 L34 10 M60 24 L67 10" /><circle cx="34" cy="9" r="4" /><circle cx="67" cy="9" r="4" /></g>
      : kind === 'bird' || kind === 'aqua' ? <path d="M42 25 L42 7 L52 18 L61 9 L59 28" fill={style.accent} />
      : kind === 'mech' ? <g fill={style.accent}><rect x="41" y="13" width="18" height="13" rx="3" /><circle cx="25" cy="44" r="4" /><circle cx="76" cy="44" r="4" /></g>
      : kind === 'dawn' || kind === 'dusk' ? <path d="M50 7 L55 17 L65 20 L55 24 L50 33 L45 24 L35 20 L45 17 Z" fill={style.accent} />
      : <path d="M38 27 L41 10 L50 24 L58 10 L63 29" fill={style.accent} />}
    <ellipse cx="37" cy="45" rx="4" ry="5" fill="#293f35" /><ellipse cx="63" cy="45" rx="4" ry="5" fill="#293f35" />
    <circle cx="38" cy="43" r="1.4" fill="white" /><circle cx="64" cy="43" r="1.4" fill="white" />
    <path d="M44 55 Q50 60 56 55" fill="none" stroke="#293f35" strokeWidth="2" strokeLinecap="round" />
    <ellipse cx="28" cy="53" rx="5" ry="3" fill="#fff" opacity=".3" /><ellipse cx="72" cy="53" rx="5" ry="3" fill="#fff" opacity=".3" />
  </svg>;
}

export default function HeroesPanel({ onClose }: { onClose: () => void }) {
  const [heroId, setHeroId] = useState<string | null>(null);
  const hero = STARTER_HEROES.find(item => item.id === heroId);
  return <section className="heroes panel" aria-label="Axie heroes">
    <div className="catalog-heading"><div><h2>Axie heroes</h2><small>{STARTER_HEROES.length} available &middot; Starter roster</small></div><button className="close" aria-label="Close Axie heroes" onClick={onClose}>&times;</button></div>
    {hero ? <div className="hero-detail">
      <button className="secondary" onClick={() => setHeroId(null)}>Back to all Axies</button>
      <AxiePortrait kind={hero.class} />
      <h3>{hero.name}</h3><p className="hero-class">{AXIE_CLASSES[hero.class].name} &middot; Level {hero.level}</p>
      <strong>{AXIE_CLASSES[hero.class].role}</strong><p>{AXIE_CLASSES[hero.class].description}</p>
      <small>Starter hero &middot; Available</small>
    </div> : <div className="hero-roster">{STARTER_HEROES.map(item => <button key={item.id} className="hero-card" onClick={() => setHeroId(item.id)} aria-label={`View ${item.name}, ${AXIE_CLASSES[item.class].name} hero, level ${item.level}`}>
      <AxiePortrait kind={item.class} /><strong>{item.name}</strong><span>{AXIE_CLASSES[item.class].name}</span><small>Lv. {item.level} &middot; Available</small>
    </button>)}</div>}
  </section>;
}
