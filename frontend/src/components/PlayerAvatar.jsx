export default function PlayerAvatar({ name, color = '#22c55e', position = 'top-left' }) {
  const posClass = {
    'top-left': 'top-2 left-2',
    'top-right': 'top-2 right-2',
    'bottom-left': 'bottom-2 left-2',
    'bottom-right': 'bottom-2 right-2',
  }[position] || 'top-2 left-2';
  return (
    <div className={`absolute ${posClass} flex items-center gap-2 glass glow-border rounded-full px-3 py-1`}
      style={{ borderColor: color, boxShadow: `0 0 12px ${color}55` }}>
      <div className="w-7 h-7 rounded-full" style={{ background: color }} />
      <div className="text-xs">{name}</div>
    </div>
  );
}
