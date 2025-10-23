import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { rollDice, moveToken, autoMove, fetchGame } from '../features/game/gameSlice';
import { getSocket, requestLegalTokens } from '../app/socket';
import BoardCanvas from '../board/BoardCanvas.jsx';
import Toast from '../components/Toast.jsx';
import Dice from '../components/Dice.jsx';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import { log } from '../app/logger';

export default function Game() {
  const dispatch = useDispatch();
  const { turnIndex, lastDice, game, status, pendingDice } = useSelector((s) => s.game);
  const authUser = useSelector((s) => s.auth.user);
  const authUserId = authUser?._id || authUser?.userId || authUser?.id;
  const roomId = useMemo(() => game?.roomId || (typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('currentRoom') || 'null')?.roomId : null), [game]);
  
  // Debug auth on mount
  useEffect(() => {
    console.log('[Game] Auth state:', { authUser, authUserId });
  }, [authUser, authUserId]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // { value, legalTokens } - local UI state
  const [logs, setLogs] = useState([]);
  
  // Sync local pending with Redux pendingDice (restored from backend)
  useEffect(() => {
    if (pendingDice && pendingDice.playerIndex === turnIndex && pendingDice.value) {
      console.log('[Game] Restoring pending move from Redux:', pendingDice);
      setPending({ value: pendingDice.value, legalTokens: pendingDice.legalTokens || [] });
    } else if (!pendingDice && pending) {
      console.log('[Game] Clearing local pending (Redux cleared)');
      setPending(null);
    }
  }, [pendingDice, turnIndex]);

  const canRoll = useMemo(() => {
    if (!authUserId || !game?.players) return false;
    const idx = game.players.findIndex((p) => String(p.userId) === String(authUserId));
    const result = idx === turnIndex;
    const currentPlayerUserId = game.players[turnIndex]?.userId;
    console.log('[Game] canRoll check:', { 
      authUserId, 
      myPlayerIndex: idx, 
      turnIndex, 
      currentPlayerUserId,
      isMyTurn: result,
      players: game.players.map((p, i) => ({ index: i, userId: p.userId, color: p.color }))
    });
    return result;
  }, [authUserId, game, turnIndex]);
  const disableRoll = !canRoll || status !== 'idle' || Boolean(pending);
  
  // Debug: log critical state on mount and changes
  useEffect(() => {
    console.log('[Game] State:', { 
      game: game?.gameId, 
      roomId, 
      authUserId, 
      turnIndex, 
      canRoll, 
      disableRoll,
      status, 
      pending,
      players: game?.players?.length 
    });
  }, [game, roomId, authUserId, turnIndex, canRoll, disableRoll, status, pending]);

  const onRoll = useCallback(async () => {
    console.log('[Game] Dice click', { roomId, canRoll, status, pending: Boolean(pending), game: game?.gameId });
    log.info('ui:roll:click', { roomId, canRoll, status, pending: Boolean(pending) });
    if (!roomId) { 
      console.error('[Game] No roomId!', { game, localStorage: localStorage.getItem('currentRoom') });
      log.warn('ui:roll:blocked:no-room'); 
      setError('No room ID available');
      return; 
    }
    setError('');
    console.log('[Game] Dispatching rollDice...', { roomId });
    const res = await dispatch(rollDice({ roomId }));
    console.log('[Game] rollDice result:', res);
    if (res.error) {
      setError(res.payload || 'Roll failed');
      log.error('ui:roll:failed', { error: res.payload });
      return;
    }
    const ack = res.payload; // { ok, value, skipped, mustMove?, legalTokens?, turnIndex, nextTurnIndex }
    if (ack.skipped) return; // server already rotated turn

    // Prefer server-provided legal tokens
    let legal = Array.isArray(ack.legalTokens) ? ack.legalTokens : null;
    let mustMove = !!ack.mustMove;
    const value = ack.value;

    if (!legal) {
      // Ask server authoritatively when ack lacks legality
      const rulesAck = await requestLegalTokens(roomId, value).catch(() => ({ ok: false }));
      if (rulesAck?.ok) {
        legal = rulesAck.legalTokens || [];
        mustMove = !!rulesAck.mustMove;
      }
    }

    if (Array.isArray(legal) && legal.length === 1 && mustMove) {
      const tokenIndex = legal[0];
      const move = await dispatch(moveToken({ roomId, tokenIndex, steps: value }));
      if (move.error) setError(move.payload || 'Move failed');
    } else if (Array.isArray(legal) && legal.length > 1) {
      setPending({ value, legalTokens: legal });
    } else {
      // No legal moves; server already handles skip and emits turn change.
    }
  }, [dispatch, roomId, authUserId, game]);

  // Ensure we have latest game after mount
  useEffect(() => {
    console.log('[Game] Mount/roomId change:', { roomId, hasGame: !!game });
    if (roomId) {
      console.log('[Game] Fetching game state...');
      dispatch(fetchGame({ roomId }));
    } else {
      console.warn('[Game] No roomId on mount! localStorage:', localStorage.getItem('currentRoom'));
    }
  }, [dispatch, roomId]);

  // Subscribe to socket events for human-readable sequence logs
  useEffect(() => {
    const s = getSocket && getSocket();
    if (!s) return;
    const me = (game?.players || []).findIndex((p) => String(p.userId) === String(authUserId));

    const onGameStart = (p) => {
      const ids = (p.players || []).map((pl) => pl.userId).join(', ');
      setLogs((L) => [`[C1] Game started. Players: ${ids}. First turn: Player ${Number(p.turnIndex) + 1}`, ...L].slice(0, 300));
    };
    const onDice = (p) => {
      const who = Number(p.turnIndex);
      setLogs((L) => [`🎲 [Player ${who + 1}] Rolled: 🎲${p.value}`, ...L].slice(0, 300));
    };
    const onTurn = (p) => {
      setLogs((L) => [`[C1] Turn changed: Player ${Number(p.turnIndex) + 1}`, ...L].slice(0, 300));
      // Clear any pending selection on turn change
      setPending(null);
    };
    const onMove = (p) => {
      setLogs((L) => [`➡️ [Player ${Number(p.playerIndex) + 1}] Moving token ${p.tokenIndex} by ${p.steps} step(s)`, ...L].slice(0, 300));
      // Clear pending on any acknowledged move
      setPending(null);
    };
    const onEnd = (p) => {
      const winnerIdx = (game?.players || []).findIndex((pl) => String(pl.userId) === String(p.winnerUserId));
      setLogs((L) => [`🏆 Winner: Player ${winnerIdx >= 0 ? winnerIdx + 1 : '?'}${p.winnerUserId ? '' : ''}`, ...L].slice(0, 300));
    };

    s.on('game:start', onGameStart);
    s.on('dice:result', onDice);
    s.on('turn:change', onTurn);
    s.on('token:move', onMove);
    s.on('game:end', onEnd);
    return () => {
      s.off('game:start', onGameStart);
      s.off('dice:result', onDice);
      s.off('turn:change', onTurn);
      s.off('token:move', onMove);
      s.off('game:end', onEnd);
    };
  }, [game, authUserId]);

  return (
    <div className="p-6 space-y-3">
      <h2 className="text-xl font-semibold">Game</h2>
      <p className="text-sm text-gray-400">Turn: {turnIndex}</p>
      {pending && (
        <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4">
          <p className="font-semibold text-yellow-200">⚠️ You must select a token to move!</p>
          <p className="text-sm text-yellow-300 mt-1">Rolled {pending.value} - Click a token below or on the board</p>
        </div>
      )}
      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="flex flex-col items-center gap-6">
          <BoardCanvas
            game={game}
            turnIndex={turnIndex}
            legalTokens={pending?.legalTokens || []}
            onTokenClick={async (ti) => {
              if (!roomId || !pending) return;
              const res = await dispatch(moveToken({ roomId, tokenIndex: ti, steps: pending.value }));
              if (res.error) setError(res.payload || 'Move failed');
              setPending(null);
            }}
          />
          <Dice onRoll={onRoll} disabled={disableRoll} rolling={status === 'rolling'} face={lastDice || undefined} glow={canRoll && status === 'idle' && !pending} />
        </div>
        <Card className="bg-white/5 backdrop-blur border border-white/10">
          <CardContent className="p-4 text-sm space-y-2">
            <div className="font-medium">HUD</div>
            <div>Last dice: {lastDice ?? '-'}</div>
            <div className="text-xs text-gray-400">Room: {roomId || '-'}</div>
            <div className="text-xs text-gray-400">Can roll: {String(canRoll)} | Status: {status} | Pending: {String(Boolean(pending))}</div>
            {pending && (
              <button
                className="underline disabled:opacity-50 w-fit"
                disabled={!roomId}
                onClick={async () => {
                  const res = await dispatch(autoMove({ roomId }));
                  if (res.error) setError(res.payload || 'Auto move failed');
                  setPending(null);
                }}
              >
                Auto move
              </button>
            )}
            <div>
              <button className="mt-2 border px-3 py-1 rounded text-xs" onClick={onRoll} disabled={disableRoll}>
                Debug Roll (same as Dice)
              </button>
            </div>
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
            <div className="mt-4">
              <div className="font-medium mb-1">Log</div>
              <div className="h-64 overflow-auto border rounded p-2 bg-black/20 space-y-1">
                {logs.slice(0, 200).map((line, i) => (
                  <div key={i} className="text-xs whitespace-pre-wrap">{line}</div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Toast message={error} onClose={() => setError('')} />
    </div>
  );
}
