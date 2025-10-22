import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { rollDice, moveToken, autoMove, fetchGame } from '../features/game/gameSlice';
import BoardRenderer from '../board/BoardRenderer.jsx';
import Toast from '../components/Toast.jsx';
import Dice from '../components/Dice.jsx';

export default function Game() {
  const dispatch = useDispatch();
  const { turnIndex, lastDice, game, status } = useSelector((s) => s.game);
  const roomId = useMemo(() => game?.roomId, [game]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // { value, legalTokens }

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
      if (Array.isArray(ack.legalTokens) && ack.legalTokens.length > 1) {
        setPending({ value: ack.value, legalTokens: ack.legalTokens });
      } else {
        const tokenIndex = (ack.legalTokens?.[0] ?? 0);
        const move = await dispatch(moveToken({ roomId, tokenIndex, steps: ack.value }));
        if (move.error) setError(move.payload || 'Move failed');
      }
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
      <div className="flex items-center gap-6">
        <Dice onRoll={onRoll} disabled={!canRoll || status !== 'idle'} rolling={status === 'rolling'} face={lastDice || undefined} glow={canRoll && status === 'idle'} />
        <div className="flex flex-col gap-2 text-sm">
          <div>Last dice: {lastDice ?? '-'}</div>
          <button className="underline disabled:opacity-50 w-fit" disabled={status !== 'idle' || !roomId} onClick={() => dispatch(autoMove({ roomId }))}>
            Auto move
          </button>
        </div>
      </div>
      {pending && (
        <div className="p-3 border rounded max-w-md">
          <div className="mb-2 text-sm">Select a token to move ({pending.value} steps):</div>
          <div className="flex gap-2">
            {pending.legalTokens.map((ti) => (
              <button
                key={ti}
                className="border rounded px-3 py-1 text-sm"
                onClick={async () => {
                  const res = await dispatch(moveToken({ roomId, tokenIndex: ti, steps: pending.value }));
                  if (res.error) setError(res.payload || 'Move failed');
                  setPending(null);
                }}
              >
                Token {ti + 1}
              </button>
            ))}
          </div>
        </div>
      )}
      <Toast message={error} onClose={() => setError('')} />
      <BoardRenderer />
    </div>
  );
}
