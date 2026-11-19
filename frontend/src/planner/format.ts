// Time formatting shared by planner components.
export const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
export const fmtDur = (sec: number) => {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
