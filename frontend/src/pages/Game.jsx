import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { rollDice, moveToken, autoMove, fetchGame } from '../features/game/gameSlice';
import BoardRenderer from '../board/BoardRenderer.jsx';
import Toast from '../components/Toast.jsx';
import Dice from '../components/Dice.jsx';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';

export default function Game() {
  const dispatch = useDispatch();
  const { turnIndex, lastDice, game, status } = useSelector((s) => s.game);
  const roomId = useMemo(() => game?.roomId || (typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('currentRoom') || 'null')?.roomId : null), [game]);
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
      <p className="text-sm text-gray-400">Turn: {turnIndex}</p>
      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="flex flex-col items-center gap-6">
          <BoardRenderer />
          <Dice onRoll={onRoll} disabled={!canRoll || status !== 'idle'} rolling={status === 'rolling'} face={lastDice || undefined} glow={canRoll && status === 'idle'} />
        </div>
        <Card className="bg-white/5 backdrop-blur border border-white/10">
          <CardContent className="p-4 text-sm space-y-2">
            <div className="font-medium">HUD</div>
            <div>Last dice: {lastDice ?? '-'}</div>
            <button className="underline disabled:opacity-50 w-fit" disabled={status !== 'idle' || !roomId} onClick={() => dispatch(autoMove({ roomId }))}>
              Auto move
            </button>
            <div className="text-xs text-gray-400">Turn index: {turnIndex}</div>
            {pending && (
              <div className="p-3 border rounded">
                <div className="mb-2 text-sm">Select token ({pending.value} steps):</div>
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
          </CardContent>
        </Card>
      </div>
      <Toast message={error} onClose={() => setError('')} />
    </div>
  );
}
