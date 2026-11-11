import { useEffect, useRef, useState } from 'react';
import { type Config, type Mode, type Policy, type Result, type ScenarioId } from './DemoStudio';
import './fieldwork-assistant.css';

type Props = { open: boolean; onClose: () => void; runs: Result[]; onRun: (result: Result) => void; conversationId: string; onInspect: () => void };
export default function FieldworkAssistant({ open, onClose, runs, onRun, conversationId, onInspect }: Props) {
 const dialog = useRef<HTMLDialogElement>(null);
 const conversation = useRef<HTMLDivElement>(null);
 const inFlight = useRef(false);
 const [config, setConfig] = useState<Config | null>(null);
 const [mode, setMode] = useState<Mode>('replay');
 const [policy, setPolicy] = useState<Policy>('guarded');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const latest = runs.at(-1);
 useEffect(() => {
   if (!open) return;
   setMode(latest?.mode ?? 'replay'); setPolicy(latest?.policy ?? 'guarded');
   const controller = new AbortController();
   fetch('/api/demo/config', { signal: controller.signal }).then(async response => {
     if (!response.ok) throw new Error('Could not load the assistant. Close and reopen to retry.');
     setConfig(await response.json()); setError('');
   }).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
   const el = dialog.current; el?.showModal();
   return () => { controller.abort(); el?.close(); };
 }, [open]);
 useEffect(() => { conversation.current?.scrollTo({ top: conversation.current.scrollHeight, behavior: 'instant' }); }, [runs, busy, open]);
 async function send(scenario: ScenarioId) {
   if (inFlight.current || !config) return;
   inFlight.current = true; setBusy(true); setError('');
   try {
     const response = await fetch('/api/demo/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario, mode, policy, session_id: conversationId }) });
     const body = await response.json();
     if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'The request failed. Please try again.');
     onRun(body as Result);
   } catch (e) { setError(e instanceof Error ? e.message : 'The request failed.'); }
   finally { inFlight.current = false; setBusy(false); }
 }
 const myOrder = (latest?.orders_after ?? config?.orders)?.find(order => order.customer_id === config?.customer.id);
 if (!open) return null;
 return <dialog ref={dialog} className="fieldwork-assistant" aria-labelledby="assistant-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
   <header className="fa-header"><div><span className="eyebrow">YOUR FIELDWORK COMPANION</span><h2 id="assistant-title">A little help for the outdoors.</h2></div><button onClick={onClose} disabled={busy} aria-label="Close assistant">×</button></header>
   <div className="fa-account"><span className="fa-avatar">AM</span><div><strong>{config?.customer.name ?? 'Alex Morgan'}</strong><small>Signed in as demo shopper · Synthetic account</small></div></div>
   <div className="fa-conversation" ref={conversation} role="log" aria-label="Shopping assistant conversation" aria-live="polite" aria-busy={busy}>
     <div className="fa-welcome"><strong>Hi Alex. Where are we headed?</strong><p>I can help with gear and delivery updates. Try a request below.</p><small>Each request starts with fresh synthetic orders. Your shopping bag is separate.</small></div>
     {runs.map(result => <article className="fa-turn" key={result.trace_id}>
       <p className="fa-question">{config?.scenarios.find(s => s.id === result.scenario)?.prompt}</p>
       <div className="fa-answer"><span className="fa-avatar">f.</span><p>{result.answer}</p></div>
       <small>{result.mode === 'replay' ? 'Scripted replay · No model call' : 'Live Foundry'}</small>
     </article>)}
     {busy && <p role="status">{mode === 'live' ? 'Asking the assistant…' : 'Replaying request…'}</p>}
   </div>
   {error && <p className="fa-error" role="alert">{error}</p>}
   <div className="fa-suggestions" aria-label="Suggested requests">{config?.scenarios.map(s => <button key={s.id} disabled={busy} onClick={() => void send(s.id)}>{s.id === 'product' ? 'Tell me about the Alpine tent' : s.id === 'own_order' ? 'Update my delivery address' : s.id === 'unauthorized' ? 'Help with a friend’s order' : 'Write a competitor campaign'} <span>↗</span></button>)}</div>
   {myOrder && <div className="fa-order"><span className="eyebrow">MY DEMO ORDER · {myOrder.id}</span><strong>{myOrder.product}</strong><span>{myOrder.status} · Deliver to {myOrder.address}</span></div>}
   {latest && <div className="fa-studio-link"><button disabled={busy} onClick={onInspect}>Inspect this run in demo studio →</button></div>}
   <details className="fa-settings"><summary>Demo settings · {mode === 'replay' ? 'Local replay' : 'Live Foundry'} · {policy === 'guarded' ? 'Guarded' : 'Baseline'}</summary><div><label htmlFor="fa-mode">Execution<select id="fa-mode" disabled={busy} value={mode} onChange={e => setMode(e.target.value as Mode)}><option value="replay">Local replay · scripted answers</option><option value="live" disabled={!config?.live_enabled || !config?.live_configured}>Live · Azure Foundry</option></select></label><label htmlFor="fa-policy">Tool authorization<select id="fa-policy" disabled={busy} value={policy} onChange={e => setPolicy(e.target.value as Policy)}><option value="guarded">Guarded · enforce ownership</option><option value="baseline">Baseline · broad fixture access</option></select></label><p>Replay uses scripted answers. Live mode uses inference tokens. Run evidence is available in the demo studio.</p></div></details>
 </dialog>;
}
