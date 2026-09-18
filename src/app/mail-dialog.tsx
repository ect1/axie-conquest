"use client";

import { useEffect, useRef, useState } from 'react';
import type { BattleReport } from '@/game/battle-save';
import BattleReplayViewer from './battle-replay';

const CATEGORIES = ['Battle Logs', 'Scout Reports'];
export default function MailDialog({ onClose, battleReports }: { onClose: () => void; battleReports: BattleReport[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState(0), [selected, setSelected] = useState(0);
  const [watching, setWatching] = useState<BattleReport | null>(null);
  const report = battleReports[selected] ?? battleReports[0];
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => previous?.focus(); }, []);
  return <dialog ref={dialog} className="assignment-popup mail-dialog" aria-labelledby="mail-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div>
      <div className="catalog-heading"><div><h2 id="mail-title">Mail</h2><small>Reports from across Lunacia</small></div><button className="close" aria-label="Close mail" onClick={onClose}>&times;</button></div>
      <div className="slot-tabs" role="tablist" aria-label="Mail categories">{CATEGORIES.map((label, index) => <button key={label} id={`mail-tab-${index}`} role="tab" aria-selected={index === category} aria-controls="mail-content" tabIndex={index === category ? 0 : -1} className={index === category ? 'active' : ''} onClick={() => setCategory(index)} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - category;
        setCategory(next); dialog.current?.querySelector<HTMLButtonElement>(`#mail-tab-${next}`)?.focus();
      }}>{label}{index === 0 && battleReports.length > 0 ? ` (${battleReports.length})` : ''}</button>)}</div>
      <div id="mail-content" role="tabpanel" aria-labelledby={`mail-tab-${category}`} tabIndex={0}>
        {category === 0 && report ? <>
          <nav className="battle-mail-list" aria-label="Battle reports">{battleReports.map((entry, index) => <button key={entry.id ?? index} aria-pressed={selected === index} onClick={() => setSelected(index)}><strong>{entry.result} · {entry.target}</strong><small>{entry.completedAt ? new Date(entry.completedAt).toLocaleString() : 'Earlier battle'}</small></button>)}</nav>
          <article className="battle-mail-report"><h3>{report.result} at {report.target}</h3><p><strong>{report.armyName ?? 'Your formation'}</strong>{report.armies && report.armies.length > 1 ? ' (Joint Assault)' : ''}</p>
            <p>{report.seconds.toFixed(1)} seconds{report.location ? ` · Location ${report.location.x.toFixed(1)}, ${report.location.z.toFixed(1)}` : ''}</p>
            <p>Lost: {report.losses.infantry} infantry, {report.losses.archer} archers. {report.survivors} surviving members.</p>
            {report.armies && report.armies.length > 1 && (
              <div style={{ margin: '8px 0', padding: '6px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                <small style={{ fontWeight: 600, display: 'block', marginBottom: '4px' }}>Combined Formations Breakdown:</small>
                {report.armies.map(a => (
                  <div key={a.id} style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>{a.name}</span>
                    <span>Dealt: {Math.round(a.damage)} · Lost: {a.losses.infantry} inf, {a.losses.archer} arc · Surv: {a.survivors}</span>
                  </div>
                ))}
              </div>
            )}
            <p>{report.result === 'victory' ? 'The site was defeated. Your formation remains in the world, ready for orders.' : 'The formation returned toward home. Knocked-out Axies recover there.'}</p>
            {report.members && <div className="battle-report-table"><table><caption>Formation results</caption><thead><tr><th>Unit</th><th>Started</th><th>Survived</th><th>Damage</th></tr></thead><tbody>{report.members.map((member, i) => <tr key={i}><th>{member.name}<small>{member.formationName ?? (member.side === 'player' ? 'Your formation' : 'Defenders')}</small></th><td>{member.starting}</td><td>{member.surviving}</td><td>{Math.round(member.damage)}</td></tr>)}</tbody></table><p>Commander skills used: {report.members.reduce((sum, m) => sum + m.skills, 0)} · Healing: {Math.round(report.members.reduce((sum, m) => sum + m.healing, 0))}</p></div>}
            <p>No resource rewards were granted by this battle.</p>
            {report.replay ? <button className="primary" onClick={() => setWatching(report)}>Watch Replay</button> : <p>Recording unavailable for this battle.</p>}
          </article>
        </> : <div className="empty-state"><strong>{category === 0 ? 'No battle logs yet' : 'No scout reports yet'}</strong><p>{category === 0 ? 'Completed fights arrive here automatically.' : 'Scouting reports will appear here when available.'}</p></div>}
      </div>
      <p className="catalog-footer">Up to five recent battle logs are kept on this device, within available archive space.</p>
    </div>
    {watching?.replay && <BattleReplayViewer replay={watching.replay} onClose={() => setWatching(null)} />}
  </dialog>;
}
