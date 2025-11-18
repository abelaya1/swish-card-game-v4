const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const {
  dealInitialState,
  canPlayOnTop,
  isFourOfAKindClear,
  getPlayableCardsByRank,
  aiTakeTurn,
  addLog,
  // facedown / misc helpers
  canUseFacedown,
  playFacedownCard,
  checkAndFinishIfWinner,
} = require('./game'); // centralized helpers

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.get('/', (_req, res) => res.send('Swish server OK'));

const rooms = new Map();
// roomCode -> { players: Set<socketId>, state }

// --- Auto-pickup helper (used when player has no valid moves) ---
function autoPickupIfNoMoves(room, playerId) {
  const S = room.state;
  if (!S) return false;

  const p = S.players[playerId];
  if (!p) return false;

  //  If the player can play from facedown, do NOT auto-pickup.
  if (canUseFacedown(S, playerId)) return false;

  const hand = p.hand || [];
  const top = S.discard?.[S.discard.length - 1] || null;

  const playable = getPlayableCardsByRank(hand, top, S.discardIsReset);

  if (playable.length === 0 && S.discard.length > 0) {
    addLog(
      S,
      `${playerId === 'AI' ? 'AI' : playerId} picked up the pile (${S.discard.length} cards) — no valid move`
    );
    hand.push(...S.discard);
    S.discard.length = 0;
    S.discardIsReset = false;

    // Pass turn
    const i = S.turnOrder.indexOf(S.activePlayer);
    S.activePlayer = S.turnOrder[(i + 1) % S.turnOrder.length];
    return true;
  }
  return false;
}


// ----------------------------------------------
// Main socket.io logic
// ----------------------------------------------
io.on('connection', (socket) => {
  console.log('A player connected:', socket.id);
  socket.emit('welcome', 'Hello from server!');

  socket.on('createRoom', (roomCode, ack) => {
    if (rooms.has(roomCode)) return ack?.({ ok:false, error:'Room exists' });
    rooms.set(roomCode, { players: new Set([socket.id]), state: null });
    socket.join(roomCode);
    ack?.({ ok:true });
    io.to(roomCode).emit('roomUpdate', Array.from(rooms.get(roomCode).players));
  });

  socket.on('joinRoom', (roomCode, ack) => {
    const room = rooms.get(roomCode);
    if (!room) return ack?.({ ok:false, error:'No such room' });
    room.players.add(socket.id);
    socket.join(roomCode);
    ack?.({ ok:true });
    io.to(roomCode).emit('roomUpdate', Array.from(room.players));
  });

  // --- Start Game (supports single-player w/ AI) ---
  socket.on('startGame', (roomCode, ack) => {
    const room = rooms.get(roomCode);
    if (!room) return ack?.({ ok:false, error:'No such room' });

    const humanIds = Array.from(room.players);
    let playerIds = humanIds;

    // Allow single player by adding AI seat
    if (humanIds.length === 1) {
      playerIds = [...humanIds, 'AI'];
      console.log('\x1b[36m%s\x1b[0m', 'AI joined the game (single-player mode)');
    }

    if (playerIds.length < 2) {
      return ack?.({ ok:false, error:'Need at least 1 human (server adds AI) or 2 humans' });
    }

    room.state = dealInitialState(playerIds);

    // Randomize starting player
    const ids = room.state.turnOrder;
    room.state.activePlayer = ids[(Math.random() * ids.length) | 0];

    addLog(room.state, `Game started — Players: ${ids.join(' vs ')}`);

    // If human starts but has no legal moves, auto-pickup before first emit
    if (room.state.activePlayer !== 'AI') {
      autoPickupIfNoMoves(room, room.state.activePlayer);
    }

    ack?.({ ok:true, state: room.state });
    io.to(roomCode).emit('state', room.state);

    // If AI is up (either initially or after auto-pickup), trigger it
    if (room.state.activePlayer === 'AI') {
      const roomObj = { state: room.state, code: roomCode, humans: humanIds };
      aiTakeTurn(roomObj, io).catch(console.error);
    }
  });

  // --- Play Card (single ID or multiple IDs of same rank) ---
  socket.on('playCard', (roomCode, cardIds, ack) => {
    const room = rooms.get(roomCode);
    if (!room || !room.state) return ack?.({ ok:false, error:'No game' });

    const S = room.state;
    if (S.activePlayer !== socket.id) return ack?.({ ok:false, error:'Not your turn' });

    const me = S.players[socket.id];
    if (!me) return ack?.({ ok:false, error:'Player not in state' });

    // Normalize to array
    const ids = Array.isArray(cardIds) ? cardIds : [cardIds];

    // Find all cards; ensure they exist in hand
    const cards = [];
    for (const id of ids) {
      const i = me.hand.findIndex(c => c.id === id);
      if (i === -1) return ack?.({ ok:false, error:'One or more cards not in hand' });
      cards.push(me.hand[i]);
    }

    // Must be same rank for multi-play
    if (!cards.every(c => c.rank === cards[0].rank)) {
      return ack?.({ ok:false, error:'Multi-play requires same rank' });
    }

    const top = S.discard[S.discard.length - 1];

    // Centralized legality check
    const canPlayNow = canPlayOnTop(top, cards[0].rank, S.discardIsReset);
    if (!canPlayNow) {
      return ack?.({ ok:false, error:`Cannot beat ${top?.rank || '(empty)'} right now` });
    }

    // --- Play all selected cards ---
    for (const c of cards) {
      const i = me.hand.findIndex(x => x.id === c.id);
      if (i !== -1) {
        me.hand.splice(i, 1);
        S.discard.push(c);
      }
    }
    addLog(S, `Player ${socket.id} played ${cards.map(c => `${c.rank}${c.suit}`).join(', ')}`);

    // --- Power-card effects + 4-of-a-kind ---
    let extraTurn = false;
    const playedRank = cards[0].rank;

    if (playedRank === '2') {
      S.discardIsReset = true;   // free play next
      extraTurn = true;          // same player again
      addLog(S, `Power: 2 — pile reset, Player ${socket.id} gets an extra turn`);
    } else if (playedRank === '10') {
      S.discard.length = 0;      // destroy pile
      S.discardIsReset = true;   // free play next
      extraTurn = true;          // same player again
      addLog(S, `Power: 10 — pile destroyed, Player ${socket.id} gets an extra turn`);
    } else {
      // Four-of-a-kind on top (last 4 are same rank)
      if (isFourOfAKindClear(S.discard)) {
        S.discard.length = 0;    // clear
        S.discardIsReset = true; // free play next
        extraTurn = true;        // same player again
        addLog(S, `Four-of-a-kind! Pile cleared — Player ${socket.id} gets an extra turn`);
      } else {
        S.discardIsReset = false;
      }
    }

    // Check if this play emptied the player’s hand and there are no facedown cards left
    if (S.deck.length === 0 && checkAndFinishIfWinner(S, socket.id)) {
      io.to(roomCode).emit('state', S);
      return ack?.({ ok: true, state: S });
    }
    
    // --- Simple auto-draw back to 5 (if deck available) ---
    while (me.hand.length < 5 && S.deck.length > 0) {
      me.hand.push(S.deck.pop());
    }

    // --- Turn handling ---
    if (extraTurn) {
      S.activePlayer = socket.id; // same player goes again
    } else {
      const i = S.turnOrder.indexOf(S.activePlayer);
      S.activePlayer = S.turnOrder[(i + 1) % S.turnOrder.length];
    }

    // If next up is a human (not AI) and they have no move, auto-pickup before we emit
// If next up is a different human (not AI), auto-pickup them if stuck
if (S.activePlayer !== 'AI' && S.activePlayer !== socket.id) {
  autoPickupIfNoMoves(room, S.activePlayer);
}

    io.to(roomCode).emit('state', S);
    ack?.({ ok:true, state: S });

    // If it's now AI's turn, let it play
    if (S.activePlayer === 'AI') {
      const humanIds = Array.from(room.players);
      const roomObj = { state: room.state, code: roomCode, humans: humanIds };
      aiTakeTurn(roomObj, io).catch(console.error);
    }
  });

  // --- Play one facedown card (row, col) ---
  socket.on('playFacedown', (roomCode, pos, ack) => {
    const room = rooms.get(roomCode);
    if (!room || !room.state) return ack?.({ ok:false, error:'No game' });

    const S = room.state;
    if (S.activePlayer !== socket.id) return ack?.({ ok:false, error:'Not your turn' });

    if (!canUseFacedown(S, socket.id)) {
      return ack?.({ ok:false, error:'Cannot play from facedown now' });
    }

    const { row, col } = pos || {};
    const res = playFacedownCard(S, socket.id, row, col);
    if (!res.ok) return ack?.({ ok:false, error: res.error });

  // If the facedown card play emptied all cards (hand + facedown), end the game
  if (res.played && checkAndFinishIfWinner(S, socket.id)) {
    io.to(roomCode).emit('state', S);
    return ack?.({ ok: true, state: S });
  }

    // Turn handling:
    if (res.played) {
      if (res.extraTurn) {
        S.activePlayer = socket.id; // extra turn
      } else {
        const i = S.turnOrder.indexOf(S.activePlayer);
        S.activePlayer = S.turnOrder[(i + 1) % S.turnOrder.length];
      }
    } else {
      // failed -> picked up pile; turn passes
      const i = S.turnOrder.indexOf(S.activePlayer);
      S.activePlayer = S.turnOrder[(i + 1) % S.turnOrder.length];
    }

    io.to(roomCode).emit('state', S);
    ack?.({ ok:true, state: S });

    if (S.activePlayer === 'AI') {
      const humanIds = Array.from(room.players);
      const roomObj = { state: S, code: roomCode, humans: humanIds };
      aiTakeTurn(roomObj, io).catch(console.error);
    }
  });

  // keep rooms tidy
  socket.on('disconnect', () => {
    for (const [code, room] of rooms) {
      if (room.players.delete(socket.id)) {
        io.to(code).emit('roomUpdate', Array.from(room.players));
        if (room.players.size === 0) rooms.delete(code);
      }
    }
  });
}); // closes io.on('connection')

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
