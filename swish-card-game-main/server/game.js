// server/game.js

// ---------- Card helpers ----------
const RANKS = ["3","4","5","6","7","8","9","J","Q","K","A","2","10"];

function createDeck() {
  const suits = ["♠","♥","♦","♣"]; // suits are cosmetic
  const deck = [];
  for (const r of RANKS) {
    for (const s of suits) {
      deck.push({
        id: `${r}${s}-${Math.random().toString(36).slice(2, 8)}`,
        rank: r,
        suit: s,
      });
    }
  }
  return deck;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function rankIndex(rank) { return RANKS.indexOf(rank); }
function isPower(rank) { return rank === "A" || rank === "2" || rank === "10"; }

// ---------- Dealing ----------
function dealInitialState(playerIds) {
  let deck = shuffle(createDeck());

  const players = {};
  for (const pid of playerIds) {
    const facedown = [
      [deck.pop(), deck.pop()],
      [deck.pop(), deck.pop()],
      [deck.pop(), deck.pop()],
    ];
    const hand = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    players[pid] = {
      id: pid,
      hand,
      facedown, // 3 columns x 2 cards
      pickedPile: false,
    };
  }

  const state = {
    phase: "playing",
    turnOrder: [...playerIds],
    activePlayer: playerIds[0],
    discard: [],
    deck,
    players,
    discardIsReset: false, // used by 2/10 logic
    lastRanksRun: [],
    log: [],               // play-by-play log
  };

  return state;
}

// ---------- Comparers / legality ----------
function canBeat(topRank, candidateRank) {
  if (isPower(candidateRank)) return true; // A/2/10 beat anything
  if (!topRank) return true;
  return rankIndex(candidateRank) >= rankIndex(topRank);
}

function getTop(discard) {
  return discard?.[discard.length - 1] || null;
}

function getPlayableCardsByRank(hand, topCard, discardIsReset) {
  if (discardIsReset || !topCard) return hand.slice(); // free play on reset or empty
  return hand.filter(
    (c) =>
      c.rank === "2" ||
      c.rank === "10" ||
      c.rank === "A" ||
      rankIndex(c.rank) >= rankIndex(topCard.rank)
  );
}

function pickLowestByRank(cards) {
  const nonPower = cards.filter(c => c.rank !== "2" && c.rank !== "10" && c.rank !== "A");
  const pool = nonPower.length ? nonPower : cards;
  return pool.slice().sort((a, b) => rankIndex(a.rank) - rankIndex(b.rank))[0];
}

function canPlayOnTop(topCard, candidateRank, discardIsReset) {
  if (discardIsReset || !topCard) return true;
  return canBeat(topCard.rank, candidateRank);
}

function isFourOfAKindClear(discard) {
  if (!discard || discard.length < 4) return false;
  const a = discard[discard.length - 1];
  const b = discard[discard.length - 2];
  const c = discard[discard.length - 3];
  const d = discard[discard.length - 4];
  return a.rank === b.rank && b.rank === c.rank && c.rank === d.rank;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------- Logging ----------
function addLog(state, msg) {
  if (!state.log) state.log = [];
  state.log.push({ t: Date.now(), msg });
  if (state.log.length > 300) state.log.shift();
}

// ---------- Draw / Facedown helpers ----------
function drawToFive(state, pid) {
  const p = state.players[pid];
  if (!p) return;
  while (p.hand.length < 5 && state.deck.length > 0) {
    p.hand.push(state.deck.pop());
  }
}

function canUseFacedown(state, pid) {
  const p = state.players[pid];
  return (
    p &&
    state.deck.length === 0 &&
    p.hand.length === 0 &&
    Array.isArray(p.facedown) &&
    p.facedown.flat().some(Boolean)
  );
}

// Play exactly one facedown card at [row, col].
// Returns {ok, played, extraTurn, card, error}
function playFacedownCard(state, pid, row, col) {
  const p = state.players[pid];
  if (!p) return { ok: false, error: "No player" };
  if (!canUseFacedown(state, pid)) return { ok: false, error: "Cannot use facedown now" };

  const r = Number(row), c = Number(col);
  if (!p.facedown[r] || !p.facedown[r][c]) return { ok: false, error: "Empty slot" };

  const card = p.facedown[r][c];
  p.facedown[r][c] = null; // consumed (revealed)

  const top = getTop(state.discard);
  const canPlayNow = canPlayOnTop(top, card.rank, state.discardIsReset);

  // If can't beat: flipped card -> hand; pick up pile; end turn
  if (!canPlayNow) {
    p.hand.push(card);
    if (state.discard.length > 0) {
      addLog(state, `${pid === "AI" ? "AI" : `Player ${pid}`} flipped ${card.rank}${card.suit} — cannot beat, picked up ${state.discard.length} cards`);
      p.hand.push(...state.discard);
      state.discard.length = 0;
    } else {
      addLog(state, `${pid === "AI" ? "AI" : `Player ${pid}`} flipped ${card.rank}${card.suit} — cannot beat (pile empty)`);
    }
    state.discardIsReset = false;
    return { ok: true, played: false, extraTurn: false, card };
  }

  // Can beat: play it
  state.discard.push(card);
  addLog(state, `${pid === "AI" ? "AI" : `Player ${pid}`} played facedown ${card.rank}${card.suit}`);

  // Power effects / 4-of-a-kind
  let extraTurn = false;
  if (card.rank === "2") {
    state.discardIsReset = true;
    extraTurn = true;
    addLog(state, `Power: 2 — pile reset, ${pid === "AI" ? "AI" : `Player ${pid}`} gets an extra turn`);
  } else if (card.rank === "10") {
    state.discard.length = 0;
    state.discardIsReset = true;
    extraTurn = true;
    addLog(state, `Power: 10 — pile destroyed, ${pid === "AI" ? "AI" : `Player ${pid}`} gets an extra turn`);
  } else if (isFourOfAKindClear(state.discard)) {
    state.discard.length = 0;
    state.discardIsReset = true;
    extraTurn = true;
    addLog(state, `Four-of-a-kind! Pile cleared — ${pid === "AI" ? "AI" : `Player ${pid}`} gets an extra turn`);
  } else {
    state.discardIsReset = false;
  }

  return { ok: true, played: true, extraTurn, card };
}

// ---------- Winner helpers ----------
function facedownLeft(state, pid) {
  const p = state.players[pid];
  if (!p || !Array.isArray(p.facedown)) return 0;
  return p.facedown.flat().filter(Boolean).length;
}

function checkAndFinishIfWinner(state, pid) {
  const p = state.players[pid];
  if (!p) return false;
  const noneInHand = p.hand.length === 0;
  const noneFacedown = facedownLeft(state, pid) === 0;
  if (noneInHand && noneFacedown) {
    state.phase = "gameover";
    state.winner = pid;
    addLog(state, `${pid === "AI" ? "AI" : `Player ${pid}`} has no cards left — WIN`);
    return true;
  }
  return false;
}

// ==========================
// AI Opponent Logic (rank-based) - plays duplicates
// ==========================
async function aiTakeTurn(room, io) {
  const s = room.state;
  const ai = s.players["AI"];
  if (!ai) return;

  await sleep(600);

  // helper: if human next can't play, auto-pickup & let AI continue
  const autoPickupHumanIfNoMoves = async () => {
    const humanId = room.humans[0];
    const human = s.players[humanId];
    if (!human) return false;

    // If human can flip from facedown, DO NOT auto-pickup
    if (canUseFacedown(s, humanId)) return false;

    const top = getTop(s.discard);
    const playable = getPlayableCardsByRank(human.hand, top, s.discardIsReset);

    if (playable.length === 0 && s.discard.length > 0) {
      addLog(s, `Player ${humanId} picked up the pile (${s.discard.length} cards) — no valid move`);
      human.hand.push(...s.discard);
      s.discard.length = 0;
      s.discardIsReset = false;

      s.activePlayer = "AI";
      io.to(room.code).emit("state", s);
      await sleep(250);
      await aiTakeTurn(room, io);
      return true;
    }
    return false;
  };

  // draw to five at start
  const beforeLen = ai.hand.length;
  drawToFive(s, "AI");
  if (ai.hand.length !== beforeLen) {
    addLog(s, `AI drew ${ai.hand.length - beforeLen} card(s)`);
    io.to(room.code).emit("state", s);
    await sleep(150);
  }

  // If deck empty and AI truly has no cards / facedown -> win
  if (s.deck.length === 0 && checkAndFinishIfWinner(s, "AI")) {
    io.to(room.code).emit("state", s);
    return;
  }

  // Facedown phase (if eligible)
  if (canUseFacedown(s, "AI")) {
    // pick the first available facedown slot
    let r = 0, c = 0, found = false;
    for (let i = 0; i < ai.facedown.length && !found; i++) {
      for (let j = 0; j < ai.facedown[i].length && !found; j++) {
        if (ai.facedown[i][j]) { r = i; c = j; found = true; }
      }
    }
    const res = playFacedownCard(s, "AI", r, c);
    io.to(room.code).emit("state", s);
    await sleep(200);

    if (res.played && checkAndFinishIfWinner(s, "AI")) {
      io.to(room.code).emit("state", s);
      return;
    }

    if (!res.played) {
      // failed → picked pile, end AI turn -> human
      s.activePlayer = room.humans[0];
      if (!(await autoPickupHumanIfNoMoves())) io.to(room.code).emit("state", s);
      return;
    }

    if (res.extraTurn) {
      return aiTakeTurn(room, io);
    } else {
      s.discardIsReset = false;
      s.activePlayer = room.humans[0];
      if (!(await autoPickupHumanIfNoMoves())) io.to(room.code).emit("state", s);
      return;
    }
  }

  const top = getTop(s.discard);
  let playable = getPlayableCardsByRank(ai.hand, top, s.discardIsReset);

  // No move — pick up pile & pass to human
  if (playable.length === 0) {
    if (s.discard.length) {
      addLog(s, `AI picked up the pile (${s.discard.length} cards) — no valid move`);
      ai.hand.push(...s.discard);
      s.discard.length = 0;
    } else {
      addLog(s, `AI passes — no pile to pick up`);
    }
    s.discardIsReset = false;
    s.activePlayer = room.humans[0];
    if (!(await autoPickupHumanIfNoMoves())) io.to(room.code).emit("state", s);
    return;
  }

  // choose lowest legal non-power (preserve A/2/10)
  const chosen = pickLowestByRank(playable);
  const chosenRank = chosen.rank;

  // play whole bundle of that rank
  const bundle = ai.hand.filter(c => c.rank === chosenRank);
  for (const c of bundle) {
    const idx = ai.hand.findIndex(x => x.id === c.id);
    if (idx >= 0) ai.hand.splice(idx, 1);
    s.discard.push(c);
  }
  addLog(s, `AI played ${bundle.map(c => `${c.rank}${c.suit}`).join(", ")}`);
  io.to(room.code).emit("state", s);

  // draw after play
  const preDraw = ai.hand.length;
  drawToFive(s, "AI");
  if (ai.hand.length !== preDraw) {
    addLog(s, `AI drew ${ai.hand.length - preDraw} card(s)`);
    io.to(room.code).emit("state", s);
  }

  // If deck empty and AI now has zero cards/facedown -> win
  if (s.deck.length === 0 && checkAndFinishIfWinner(s, "AI")) {
    io.to(room.code).emit("state", s);
    return;
  }

  // power effects & four-of-a-kind
  if (chosenRank === "2") {
    s.discardIsReset = true;
    addLog(s, `Power: 2 — pile reset, AI gets an extra turn`);
    io.to(room.code).emit("state", s);
    return aiTakeTurn(room, io);
  }
  if (chosenRank === "10") {
    s.discard.length = 0;
    s.discardIsReset = true;
    addLog(s, `Power: 10 — pile destroyed, AI gets an extra turn`);
    io.to(room.code).emit("state", s);
    return aiTakeTurn(room, io);
  }
  if (isFourOfAKindClear(s.discard)) {
    s.discard.length = 0;
    s.discardIsReset = true;
    addLog(s, `Four-of-a-kind! Pile cleared — AI gets an extra turn`);
    io.to(room.code).emit("state", s);
    return aiTakeTurn(room, io);
  }

  // normal end of AI turn -> human; auto-check human for forced pickup
  s.discardIsReset = false;
  s.activePlayer = room.humans[0];
  if (!(await autoPickupHumanIfNoMoves())) io.to(room.code).emit("state", s);
}

// ---------- Exports ----------
module.exports = {
  RANKS,
  rankIndex,
  isPower,
  createDeck,
  shuffle,
  dealInitialState,
  canBeat,

  // Shared helpers
  getTop,
  getPlayableCardsByRank,
  pickLowestByRank,
  canPlayOnTop,
  isFourOfAKindClear,

  // AI
  aiTakeTurn,

  // Log & utilities
  addLog,
  drawToFive,
  canUseFacedown,
  playFacedownCard,
  facedownLeft,
  checkAndFinishIfWinner,
};
