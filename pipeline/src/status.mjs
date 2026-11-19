// Human-readable list of what changed since the last published run. Shown in the UI and appended to
// pipeline/state/CHANGELOG.md by the scheduled workflow.

export function diffStatus(prev, cur) {
  if (!prev) return ['first run: no previous data to compare'];
  const out = [];
  for (const s of cur.sources) {
    const p = prev.sources?.find((x) => x.id === s.id);
    if (!p) { out.push(`${s.id}: new source added`); continue; }
    if (s.sha && p.sha && s.sha !== p.sha) out.push(`${s.id}: new data published (version ${p.version ?? '?'} → ${s.version ?? '?'})`);
    for (const k of ['stops', 'routes', 'trips', 'points']) {
      const a = p.counts?.[k], b = s.counts?.[k];
      if (a !== undefined && b !== undefined && a !== b) out.push(`${s.id}: ${k} ${a} → ${b} (${b - a > 0 ? '+' : ''}${b - a})`);
    }
    if (s.effectiveFrom && p.effectiveFrom && s.effectiveFrom !== p.effectiveFrom) out.push(`${s.id}: new chart effective ${s.effectiveFrom}`);
    if (p.state !== s.state) out.push(`${s.id}: ${p.state} → ${s.state}`);
  }
  for (const p of prev.sources ?? []) if (!cur.sources.find((s) => s.id === p.id)) out.push(`${p.id}: source removed`);
  const pw = new Set((prev.decisions ?? []).map((d) => `${d.kind}:${d.winner}>${d.loser}`));
  for (const d of cur.decisions) if (!pw.has(`${d.kind}:${d.winner}>${d.loser}`)) out.push(`decision: ${d.winner} now overrides ${d.loser} (${d.reason})`);
  return out;
}
