"use client";

import { useEffect, useRef, useState } from 'react';

const MAIL_CATEGORIES = [
  { id: 'battle', label: 'Battle Logs', icon: '⚔', title: 'No battle logs yet', description: 'Battle results, troop losses, and rewards will appear here after your marches fight.' },
  { id: 'scout', label: 'Scout Reports', icon: '⌁', title: 'No scout reports yet', description: 'Discoveries, resource locations, and enemy information will appear here after scouting.' },
] as const;

export default function MailDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState(0);
  const current = MAIL_CATEGORIES[category];
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="assignment-popup mail-dialog" aria-labelledby="mail-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div>
      <div className="catalog-heading"><div><h2 id="mail-title">Mail</h2><small>Reports from across Lunacia</small></div><button className="close" aria-label="Close mail" onClick={onClose}>&times;</button></div>
      <div className="slot-tabs" role="tablist" aria-label="Mail categories">{MAIL_CATEGORIES.map((item, index) => <button key={item.id} id={`mail-tab-${item.id}`} role="tab" aria-selected={index === category} aria-controls="mail-content" tabIndex={index === category ? 0 : -1} className={index === category ? 'active' : ''} onClick={() => setCategory(index)} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - category;
        setCategory(next);
        dialog.current?.querySelector<HTMLButtonElement>(`#mail-tab-${MAIL_CATEGORIES[next].id}`)?.focus();
      }}>{item.label}</button>)}</div>
      <div className="empty-state" id="mail-content" role="tabpanel" aria-labelledby={`mail-tab-${current.id}`} tabIndex={0}>
        <span className="empty-state-icon" aria-hidden="true">{current.icon}</span><strong>{current.title}</strong><p>{current.description}</p>
      </div>
      <p className="catalog-footer">Coming soon</p>
    </div>
  </dialog>;
}
