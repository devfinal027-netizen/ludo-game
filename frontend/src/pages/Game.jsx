import { useCallback, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { rollDice, moveToken, autoMove, fetchGame } from '../features/game/gameSlice';
import BoardRenderer from '../board/BoardRenderer.jsx';

export default function Game() {
  const dispatch = useDispatch();
  const { turnIndex, lastDice, game, status } = useSelector((s) => s.game);
  const roomId = useMemo(() => game?.roomId, [game]);
  const [error, setError] = useState('');

  const canRoll = useSelector((s) => {
    const me = s.auth.user?._id || s.auth.user?.id || s.auth.user?.userId;
    const idx = game?.players?.findIndex((p) => String(p.userId) === String(me));
    return idx === turnIndex;
  });

  const onRoll = useCallback(async () => {
    if (!roomId) return;
    setError('');
    const res = await dispatch(rollDice({ roomId }));
    if (res.error) {
      setError(res.payload || 'Roll failed');
      return;
    }
    const ack = res.payload;
    if (ack.mustMove) {
      const tokenIndex = (ack.legalTokens?.[0] ?? 0);
      const move = await dispatch(moveToken({ roomId, tokenIndex, steps: ack.value }));
      if (move.error) setError(move.payload || 'Move failed');
    }
  }, [dispatch, roomId]);

  // Ensure we have latest game after mount
  useEffect(() => {
    if (roomId) dispatch(fetchGame({ roomId }));
  }, [dispatch, roomId]);

  return (
    <div className="p-6 space-y-3">
      <h2 className="text-xl font-semibold">Game</h2>
      <p className="text-sm text-gray-500">Turn: {turnIndex}</p>
      <div className="flex items-center gap-3">
        <button className="bg-black text-white rounded px-3 py-2 disabled:opacity-50" disabled={!canRoll || status !== 'idle'} onClick={onRoll}>
          Roll Dice
        </button>
        <span className="text-sm">Last dice: {lastDice ?? '-'}</span>
        <button className="underline text-sm disabled:opacity-50" disabled={status !== 'idle' || !roomId} onClick={() => dispatch(autoMove({ roomId }))}>
          Auto move
        </button>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <BoardRenderer />
    </div>
  );
}
