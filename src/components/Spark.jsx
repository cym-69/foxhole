export default function Spark({ values, color = '#8FA89B', w = 64, h = 20 }) {
  if (!values || values.length < 2) {
    return <svg width={w} height={h}><line x1="0" x2={w} y1={h / 2} y2={h / 2} stroke="#26332D" strokeDasharray="3 3" /></svg>;
  }
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
