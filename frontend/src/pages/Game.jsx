import { useSelector } from 'react-redux';

export default function Game() {
  const turnIndex = useSelector((s) => s.game.turnIndex);

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold">Game</h2>
      <p className="text-sm text-muted-foreground">Turn: {turnIndex}</p>
    </div>
  );
}
