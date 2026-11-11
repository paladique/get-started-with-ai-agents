import { useEffect, useRef, useState } from 'react';
import './demo-studio.css';

const newSessionId = () => crypto.randomUUID?.() ?? `rehearsal-${Date.now()}-${Math.random().toString(36).slice(2)}`;

type ScenarioId = 'product' | 'own_order' | 'out_of_scope' | 'unauthorized';
type Policy = 'baseline' | 'guarded';
type Mode = 'replay' | 'live';
type Order = { id: string; customer_id: string; customer: string; product: string; address: string; status: string };
type Scenario = { id: ScenarioId; title: string; risk: string; prompt: string };
type DatadogStatus = { enabled: boolean; configured: boolean; ml_app: string; site: string; application_url: string; trace_batches_accepted: number; trace_batches_failed: number; evaluation_batches_accepted: number; evaluation_batches_failed: number };
type Config = { customer: { id: string; name: string; label: string }; orders: Order[]; scenarios: Scenario[]; live_enabled: boolean; live_configured: boolean; trace_export_enabled: boolean; datadog?: DatadogStatus; fixture_notice: string };
type Check = { name: string; risk: string; passed: boolean | null; detail: string };
type Step = { name: string; kind: string; status: string; duration_ms: number; input: unknown; output: unknown; span_id: string };
type Result = { trace_id: string; scenario: ScenarioId; mode: Mode; policy: Policy; answer: string; passed: boolean; duration_ms: number; model_calls: number; input_tokens: number | null; output_tokens: number | null; model: string | null; cost_usd: number | null; orders_before: Order[]; orders_after: Order[]; checks: Check[]; steps: Step[]; evaluation_kind: string; datadog_evaluation_delivery: string };

export default function DemoStudio({ onClose }: { onClose: () => void }) {
 const sessionId = useRef(newSessionId());
 const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const dialog = useRef<HTMLDialogElement>(null);
 const [config, setConfig] = useState<Config | null>(null);
 const [scenario, setScenario] = useState<ScenarioId>('product');
 const [policy, setPolicy] = useState<Policy>('guarded');
 const [mode, setMode] = useState<Mode>('replay');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [runs, setRuns] = useState<Result[]>([]);
 const [selected, setSelected] = useState<Result | null>(null);
 const [tab, setTab] = useState<'trace' | 'evaluate' | 'monitor' | 'test'>('trace');
 useEffect(() => { const el = dialog.current; el?.showModal(); const controller = new AbortController(); fetch('/api/demo/config', { signal: controller.signal }).then(async response => { if (!response.ok) throw new Error('Could not load the presentation sandbox.'); setConfig(await response.json()); }).catch(e => { if (e.name !== 'AbortError') setError(e.message); }); return () => { controller.abort(); if (refreshTimer.current) clearTimeout(refreshTimer.current); el?.close(); }; }, []);
 async function refreshDelivery() {
   try { const response = await fetch('/api/demo/config'); if (response.ok) setConfig(await response.json()); } catch { /* Existing run evidence remains available offline. */ }
 }
 const prompt = config?.scenarios.find(s => s.id === scenario);
 async function execute(id: ScenarioId, activePolicy: Policy) {
   const response = await fetch('/api/demo/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario: id, mode, policy: activePolicy, session_id: sessionId.current }) });
   const body = await response.json();
   if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'The demo request failed.');
   const result = body as Result;
   setRuns(previous => [...previous, result]); setSelected(result);
   return result;
 }
 async function run(kind: 'single' | 'script' | 'compare') {
   if (busy || !config) return;
   setBusy(true); setError('');
   try {
     if (kind === 'compare') { const target = tab === 'test' && selected ? selected.scenario : scenario; await execute(target, 'baseline'); await execute(target, 'guarded'); setTab('test'); }
     else if (kind === 'script') { for (const item of config.scenarios) await execute(item.id, policy); }
     else await execute(scenario, policy);
   } catch (e) { setError(e instanceof Error ? e.message : 'The demo run failed.'); }
   finally { setBusy(false); if (refreshTimer.current) clearTimeout(refreshTimer.current); refreshTimer.current = setTimeout(() => void refreshDelivery(), 1500); }
 }
 const orders = selected?.orders_after ?? config?.orders ?? [];
 const activeChecks = selected?.checks.filter(c => c.passed !== null) ?? [];
 const failCount = activeChecks.filter(c => c.passed === false).length;
 const totalCalls = runs.reduce((total, run) => total + run.model_calls, 0);
 return <dialog ref={dialog} className="demo-studio" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} aria-label="Ignite presentation demo studio">
   <div className="studio-header"><div><span className="studio-event">MICROSOFT IGNITE 2026</span><h1>Trace. Evaluate. Ship.</h1><p>A good response isn’t always a good outcome.</p></div><div className="studio-top-account"><span>DEMO CUSTOMER CONTEXT</span><strong>Alex Morgan</strong><small>customer-alex · synthetic</small></div><button className="studio-exit" onClick={onClose} disabled={busy}>← Back to storefront</button></div>
   <div className="studio-disclosure"><span className="studio-status-dot"/>{mode === 'replay' ? 'SCRIPTED LOCAL REPLAY' : 'LIVE FOUNDRY MODEL'}<span>All orders and customers are synthetic. Tools never touch real orders.</span></div>
   <div className="studio-layout"><aside className="studio-controls">
     <div className="studio-section-title">01 / SET THE SCENE</div>
     <div className="customer-context"><span className="customer-avatar">AM</span><div><strong>{config?.customer.name ?? 'Alex Morgan'}</strong><span>Demo shopper · customer-alex</span></div></div>
     <label className="studio-label">Execution mode<select value={mode} onChange={e => setMode(e.target.value as Mode)} disabled={busy}><option value="replay">Local replay · no model calls</option><option value="live" disabled={!config?.live_enabled || !config.live_configured}>Live · Azure Foundry</option></select></label>
     {!config?.live_enabled && <p className="studio-hint">Live mode requires ENABLE_LIVE_DEMO=true on the server.</p>}
     <fieldset disabled={busy} className="policy-choice"><legend>Tool authorization</legend><button type="button" aria-pressed={policy === 'baseline'} onClick={() => setPolicy('baseline')} className={policy === 'baseline' ? 'policy-baseline chosen' : ''}>Baseline<span>Broad fixture access</span></button><button type="button" aria-pressed={policy === 'guarded'} onClick={() => setPolicy('guarded')} className={policy === 'guarded' ? 'policy-guarded chosen' : ''}>Guarded<span>Enforce ownership</span></button></fieldset>
     <div className="studio-section-title">02 / TRY A REQUEST</div>
     <div className="scenario-options">{config?.scenarios.map((item, i) => <button key={item.id} disabled={busy} aria-pressed={scenario === item.id} className={scenario === item.id ? 'scenario-option chosen' : 'scenario-option'} onClick={() => setScenario(item.id)}><span>0{i + 1}</span><div><strong>{item.title}</strong><small>{item.risk}</small></div><span>↗</span></button>)}</div>
     <blockquote className="prompt-preview">“{prompt?.prompt ?? 'Loading scenarios…'}”</blockquote>
     <div className="studio-actions"><button aria-label={busy ? "Running scenario" : "Run scenario"} className="studio-primary" disabled={busy || !config} onClick={() => void run('single')}>{busy ? 'Running…' : 'Run scenario'} <span>→</span></button>
     <div className="studio-secondary-actions"><button disabled={busy || !config} onClick={() => void run('script')}>Run all 4 requests</button><button disabled={busy || !config} onClick={() => void run('compare')}>Compare policies</button></div>
     <button className="studio-reset" disabled={busy} onClick={() => { sessionId.current = newSessionId(); setRuns([]); setSelected(null); setError(''); }}>↺ Reset rehearsal</button>
     <p className="studio-hint">Each request starts from the same fixture. Live requests use your deployed model and may incur inference costs. Replay answers are scripted.</p></div>
   </aside><section className="studio-stage" aria-label="Conversation and synthetic orders">
     <div className="studio-section-title">03 / OBSERVE THE OUTCOME</div>
     <div className="stage-heading"><h2>{selected && !selected.passed ? 'No exception. Still the wrong outcome.' : 'Helpful, grounded, and in bounds.'}</h2><p>{selected && !selected.passed ? 'Technical success is not the same as business correctness.' : 'Follow the request from customer context to tool execution.'}</p></div>
     <div className="demo-conversation" aria-live="polite">{runs.length === 0 ? <div className="conversation-intro"><span>✦</span><h3>Meet your Fieldwork assistant.</h3><p>Ask about the catalog, update your own order, then try an order that belongs to someone else.</p><small>Start with a normal request. End with the silent failure.</small></div> : runs.map((result, i) => <button key={result.trace_id} onClick={() => { setSelected(result); }} className={selected?.trace_id === result.trace_id ? 'conversation-run active' : 'conversation-run'} aria-label={`Inspect run ${i + 1}`}><span className="run-context">RUN {String(i + 1).padStart(2,'0')} · {result.mode === 'replay' ? 'SCRIPTED REPLAY' : 'LIVE FOUNDRY'} · {result.policy.toUpperCase()}</span><span className="customer-message">{config?.scenarios.find(s => s.id === result.scenario)?.prompt}</span><span className="assistant-message"><span className="assistant-avatar">f.</span><span>{result.answer}</span></span><span className={result.passed ? 'result-badge good' : 'result-badge bad'}>{result.passed ? '✓ Outcome checks passed' : '× Outcome checks failed'}</span></button>)}{busy && <div className="studio-running" role="status"><span className="running-dot"/>{mode === 'live' ? 'Calling Foundry and executing local fixture tools…' : 'Running scripted replay and checking outcomes…'}</div>}</div>
     {error && <div role="alert" className="studio-error">{error}<button onClick={() => { setError(''); setMode('replay'); }}>Switch to replay</button></div>}
     <div className="fixture-heading"><h3>Synthetic order book</h3><span>Reset for each run</span></div><div className="order-fixtures">{orders.map(order => { const changed = selected && order.address !== selected.orders_before.find(before => before.id === order.id)?.address; const own = order.customer_id === config?.customer.id; return <article key={order.id} className={`fixture-order ${changed ? own ? 'changed-own' : 'changed-other' : ''}`}><div><strong>{order.id}</strong><span>{own ? 'YOUR ORDER' : 'ANOTHER CUSTOMER'}</span></div><h4>{order.product}</h4><p>{order.customer}</p><div className="order-address"><small>DELIVERY ADDRESS</small>{changed && <del>{selected?.orders_before.find(before => before.id === order.id)?.address}</del>}<strong>{order.address}</strong>{changed && <span>{own ? 'Authorized update' : 'Unauthorized update — fixture only'}</span>}</div></article>; })}</div>
   </section><aside className="studio-inspector" aria-label="Run evidence">
     <div className="studio-section-title">04 / CLOSE THE RELIABILITY LOOP</div><div className="loop-tabs" role="tablist" aria-label="Reliability loop">{(['trace','evaluate','monitor','test'] as const).map(name => <button key={name} id={`tab-${name}`} role="tab" aria-selected={tab === name} aria-controls="evidence-panel" className={tab === name ? 'chosen' : ''} onClick={() => setTab(name)}>{name}</button>)}</div>
     <div role="tabpanel" id="evidence-panel" aria-labelledby={`tab-${tab}`}>
     {!selected ? <div className="inspector-empty"><span>◎</span><h3>Make the invisible visible.</h3><p>Run a request to inspect the real local spans, tool inputs, order changes, and outcome checks.</p></div> : <>
       <div className="run-measurements"><div><span>Execution</span><strong className="metric-good">Completed</strong></div><div><span>Outcome checks</span><strong className={failCount ? 'metric-bad' : 'metric-good'}>{failCount ? `${failCount} failed` : 'Passed'}</strong></div><div><span>Measured latency</span><strong>{selected.duration_ms.toFixed(1)} ms</strong></div><div><span>Model calls</span><strong>{selected.model_calls}</strong></div></div>
       {tab === 'trace' && <><div className="trace-id"><span>OTEL TRACE ID</span><code>{selected.trace_id}</code></div><div className="trace-steps">{selected.steps.map((step, i) => <details key={step.span_id} className={`trace-step ${step.status}`}><summary><span className="step-index">{i + 1}</span><div><strong>{step.name}</strong><small>{step.kind} · {step.status}</small></div><span>{step.duration_ms.toFixed(1)} ms</span></summary><div className="step-payload"><span>INPUT</span><pre>{JSON.stringify(step.input,null,2)}</pre><span>OUTPUT</span><pre>{JSON.stringify(step.output,null,2)}</pre><small>Span {step.span_id}</small></div></details>)}</div><p className="inspector-note">Real application/tool spans. Replay does not invoke an LLM. No model reasoning is fabricated or displayed.</p></>}
       {tab === 'evaluate' && <><div className="evaluation-list">{selected.checks.map(check => <article key={check.name} className={check.passed === null ? 'check-na' : check.passed ? 'check-pass' : 'check-fail'}><span>{check.passed === null ? '—' : check.passed ? '✓' : '×'}</span><div><strong>{check.name}<small>{check.risk}</small></strong><p>{check.passed === null ? 'Not exercised by this request.' : check.detail}</p></div></article>)}</div><p className="inspector-note">{selected.evaluation_kind}. Datadog custom-check delivery: {selected.datadog_evaluation_delivery}. A passing rule check is not a complete quality or security guarantee.</p></>}
       {tab === 'monitor' && <><h3 className="inspector-title">Cost, truth, safety.</h3><div className="monitor-stats"><div><span>Runs in this rehearsal</span><strong>{runs.length}</strong></div><div><span>Failed outcomes</span><strong>{runs.filter(run => !run.passed).length}</strong></div><div><span>Actual model calls</span><strong>{totalCalls}</strong></div><div><span>Selected input / output tokens</span><strong>{selected.input_tokens ?? '—'} / {selected.output_tokens ?? '—'}</strong></div><div><span>Selected model cost</span><strong>{selected.cost_usd === 0 ? '$0 · no model call' : 'Not priced'}</strong></div></div><div className="export-status"><span className="studio-status-dot"/><strong>{config?.datadog?.configured ? 'Datadog Agent Observability' : config?.trace_export_enabled ? 'OTLP export configured' : 'Local traces only'}</strong>{config?.datadog?.configured ? <><p>{config.datadog.ml_app} · {config.datadog.site}</p><p>Trace batches accepted / failed: {config.datadog.trace_batches_accepted} / {config.datadog.trace_batches_failed}<br/>Evaluation batches accepted / failed: {config.datadog.evaluation_batches_accepted} / {config.datadog.evaluation_batches_failed}</p><p>Intake counts cover this server process. Allow 3–5 minutes for traces to appear in Datadog.</p><a href={config.datadog.application_url} target="_blank" rel="noreferrer">Open in Datadog ↗</a><button className="studio-reset" onClick={() => void refreshDelivery()}>Refresh delivery status</button></> : <p>{config?.trace_export_enabled ? 'Configured for your collector. Confirm ingestion in your observability platform.' : 'Datadog export is disabled or missing server configuration. See the local development guide.'}</p>}</div></>}
       {tab === 'test' && <><h3 className="inspector-title">Test the change before shipping.</h3><p className="inspector-note">Compare the same request against broad tool access and server-enforced ownership. Live model behavior can vary.</p><div className="comparison-table"><div><strong>Policy</strong><strong>Outcome</strong><strong>Calls</strong></div>{runs.filter(run => run.scenario === selected.scenario).map(run => <button key={run.trace_id} onClick={() => setSelected(run)}><span>{run.policy}</span><span className={run.passed ? 'metric-good' : 'metric-bad'}>{run.passed ? 'Passed' : 'Failed'}</span><span>{run.model_calls}</span></button>)}</div><button className="studio-primary" disabled={busy} onClick={() => void run('compare')}>Compare selected request <span>→</span></button><p className="inspector-note">This is a local comparison, not a production rollout or a Foundry experiment submission.</p></>}
     </>}
     </div>
   </aside></div><div className="studio-footer"><span>Trace every step → Evaluate outcomes → Monitor cost & risk → Test the fix</span><span>Ignite 2026 · Fieldwork sandbox</span></div>
 </dialog>;
}
