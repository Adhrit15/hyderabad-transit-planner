import type { useTracePlayer } from './useTracePlayer';

type Player = ReturnType<typeof useTracePlayer>;

export function VisualiserControls({ player, total }: { player: Player; total: number }) {
  const { index, setIndex, playing, setPlaying, speed, setSpeed, step, state, done, totalExpanded, reset } = player;
  return (
    <div className="visualiser">
      <div className="vis-counters">
        <div><strong>{state.expanded}</strong><span>/ {totalExpanded} expanded</span></div>
        <div><strong>{state.frontier}</strong><span>in frontier</span></div>
        <div><strong>{index}</strong><span>/ {total} events</span></div>
      </div>
      <input
        type="range" min={0} max={total} value={index} aria-label="Trace position"
        onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)); }}
        className="scrub"
      />
      <div className="vis-buttons">
        <button onClick={reset} title="Restart" aria-label="Restart">⏮</button>
        <button className="primary-sm" onClick={() => (done ? (setIndex(0), setPlaying(true)) : setPlaying(!playing))}
          aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '⏸ Pause' : done ? '↻ Replay' : '▶ Play'}
        </button>
        <button onClick={step} disabled={done} title="Step to next settled node" aria-label="Step">⏭ Step</button>
        <button onClick={() => { setPlaying(false); setIndex(total); }} title="Jump to end" aria-label="End">⏭⏭</button>
        <label className="speed">
          Speed
          <input type="range" min={2} max={60} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
        </label>
      </div>
      <div className="legend">
        <span><i style={{ background: '#f59e0b' }} />settled</span>
        <span><i style={{ background: '#8b5cf6' }} />frontier</span>
        <span><i style={{ background: '#111827' }} />current</span>
        <span><i className="dash" />search tree</span>
      </div>
    </div>
  );
}
