import { useEffect, useState } from "react";

// Prefer env; fall back to same-origin
import { io } from "socket.io-client";
import HomeScreen from "./components/HomeScreen";
import LoadingScreen from "./components/LoadingScreen";
import TutorialScreen from "./components/TutorialScreen";

const SOCKET_URL = "https://swish-card-game-server-abel-f41b169b53e5.herokuapp.com";

const socket = io(SOCKET_URL, { transports: ["websocket"], reconnection: true });

// --- Styled Playing Card component ---
function Card({ card, selected, disabled, onClick, onDoubleClick }) {
  const isRed = card.suit === "♥" || card.suit === "♦";
  const borderColor = selected ? "#2ecc71" : "#d0d0d0";
  const glow = selected ? "0 0 10px rgba(46,204,113,.6)" : "0 1px 3px rgba(0,0,0,.2)";
  const textColor = isRed ? "#c40000" : "#111";
  const cursor = disabled ? "not-allowed" : "pointer";
  const opacity = disabled ? 0.7 : 1;

  const cornerStyle = {
    position: "absolute",
    fontSize: 14,
    lineHeight: "14px",
    color: textColor,
  };

  return (
    <div
      role="button"
      title={`${card.rank}${card.suit}`}
      onClick={disabled ? undefined : onClick}
      onDoubleClick={disabled ? undefined : onDoubleClick}
      style={{
        position: "relative",
        width: 72,
        height: 104,
        borderRadius: 10,
        border: `2px solid ${borderColor}`,
        background: "#fff",
        boxShadow: glow,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        cursor,
        opacity,
        transition: "transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = disabled ? "none" : "translateY(1px)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "none"; }}
    >
      {/* Center rank/suit */}
      <div style={{ textAlign: "center", color: textColor }}>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: -2 }}>{card.rank}</div>
        <div style={{ fontSize: 22, marginTop: -6 }}>{card.suit}</div>
      </div>

      {/* Top-left index */}
      <div style={{ ...cornerStyle, top: 6, left: 8 }}>
        <div style={{ fontWeight: 700 }}>{card.rank}</div>
        <div>{card.suit}</div>
      </div>

      {/* Bottom-right index (rotated) */}
      <div style={{ ...cornerStyle, bottom: 6, right: 8, transform: "rotate(180deg)" }}>
        <div style={{ fontWeight: 700 }}>{card.rank}</div>
        <div>{card.suit}</div>
      </div>
    </div>
  );
}

// --- Small card back graphic (for deck + pile layering) ---
function CardBack({ width = 72, height = 104, style }) {
  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        width,
        height,
        borderRadius: 10,
        border: "2px solid #0b3a7a",
        background:
          "linear-gradient(135deg, rgba(20,86,160,1) 0%, rgba(14,64,125,1) 60%, rgba(10,52,104,1) 100%)",
        boxShadow: "0 2px 6px rgba(0,0,0,.35)",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 8,
          borderRadius: 6,
          border: "2px dashed rgba(255,255,255,.35)",
        }}
      />
    </div>
  );
}

// --- Facedown clickable slot (used in facedown phase) ---
function FacedownSlot({ enabled, onClick }) {
  return (
    <div
      role="button"
      onClick={enabled ? onClick : undefined}
      title={enabled ? "Play a facedown card" : "Unavailable"}
      style={{
        width: 72, height: 104, borderRadius: 10,
        border: "2px solid #444",
        background: "linear-gradient(135deg,#2d2d2d,#1f1f1f)",
        boxShadow: "0 2px 6px rgba(0,0,0,.35)",
        opacity: enabled ? 1 : 0.5,
        cursor: enabled ? "pointer" : "not-allowed",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute", inset: 8, borderRadius: 6,
          border: "2px dashed rgba(255,255,255,.18)",
        }}
      />
    </div>
  );
}

export default function App() {
  const [roomCode, setRoomCode] = useState("ROOM1");
  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState([]);
  const [state, setState] = useState(null);
  const [me, setMe] = useState(null); // socket.id
  const [selected, setSelected] = useState(new Set()); // multi-select
  const [logRef, setLogRef] = useState(null);
  const [screen, setScreen] = useState("home"); // 'home' | 'loading' | 'tutorial' | 'game'
  const [mode, setMode] = useState(null);       // 'single' | 'multi'

  useEffect(() => {
    socket.on("connect", () => setMe(socket.id));
    socket.on("welcome", (msg) => console.log(msg));
    socket.on("roomUpdate", (ids) => setPlayers(ids));
    socket.on("state", (s) => setState({ ...s })); // shallow clone for React

    socket.on("matchFound", ({ roomId }) => {
      console.log("Matched in room:", roomId);
      setRoomCode(roomId);
      setJoined(true);
      setScreen("game");
  });

    return () => {
      socket.off("connect");
      socket.off("welcome");
      socket.off("roomUpdate");
      socket.off("state");
      socket.off("matchFound");
    };
  }, []);

  // Auto-scroll Game Log
  useEffect(() => {
    if (!state?.log || !logRef) return;
    logRef.scrollTop = logRef.scrollHeight;
  }, [state?.log, logRef]);

  const createRoom = () => {
    socket.emit("createRoom", roomCode, (res) => {
      if (!res.ok) return alert(res.error);
      setJoined(true);
    });
  };

  const joinRoom = () => {
    socket.emit("joinRoom", roomCode, (res) => {
      if (!res.ok) return alert(res.error);
      setJoined(true);
    });
  };

  const startGame = () => {
    socket.emit("startGame", roomCode, (res) => {
      if (!res.ok) return alert(res.error);
      setState(res.state);
      setSelected(new Set());
    });
  };

  // Single-card play (double-click quick play)
  const playOne = (cardId) => {
    socket.emit("playCard", roomCode, cardId, (res) => {
      if (!res.ok) return alert(res.error);
      setSelected(new Set());
      setState({ ...res.state });
    });
  };

  // Multi-card play (array of IDs, same rank)
  const playSelected = () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    socket.emit("playCard", roomCode, ids, (res) => {
      if (!res.ok) return alert(res.error);
      setSelected(new Set());
      setState({ ...res.state });
    });
  };

  // Toggle selection in hand
  const toggle = (cardId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(cardId) ? next.delete(cardId) : next.add(cardId);
      return next;
    });
  };

  // Select all of same rank as first selected
  const selectSameRank = () => {
    const hand = myHand;
    if (hand.length === 0 || selected.size === 0) return;
    const firstId = selected.values().next().value;
    const firstCard = hand.find((c) => c.id === firstId);
    if (!firstCard) return;
    const rank = firstCard.rank;
    const next = new Set(hand.filter((c) => c.rank === rank).map((c) => c.id));
    setSelected(next);
  };

  const clearSelection = () => setSelected(new Set());

  const myHand = state?.players?.[me]?.hand || [];
  const myFace = state?.players?.[me]?.facedown || [];
  const active = state?.activePlayer === me;

    // ====== SCREEN NAVIGATION ======
  const goHome = () => setScreen("home");

  const startSinglePlayer = () => {
    setMode("single");
    setRoomCode("ROOM1");    // you can change this if you want a special AI room
    setScreen("game");
    // optional: auto-create/join/start here later
  };

  const startMultiplayer = () => {
    setMode("multi");
    setScreen("loading");
  };

    const cancelMatchmaking = () => {
  socket.emit("cancelQuickMatch");  // tell server to clear waitingPlayer
  setScreen("home");                // return user to home page
  };



  const openTutorial = () => setScreen("tutorial");

  const handleQuitToMenu = () => {
  // Reset client-side state and go back to the home screen
  setState(null);
  setSelected(new Set());
  setJoined(false);
  setPlayers([]);
  setMode(null);
  setScreen("home");
};



  const canPlayFacedown =
    state &&
    active &&
    (state.deck?.length ?? 0) === 0 &&
    myHand.length === 0 &&
    myFace.flat().some(Boolean);

  // Top of discard
  const top =
    state?.discard && state.discard.length > 0
      ? state.discard[state.discard.length - 1]
      : null;

  const deckCount = state?.deck?.length ?? 0;

  // For log: humanize socket IDs
  const humanizeMsg = (msg) => {
    if (!state) return msg;
    let out = msg;
    if (me) out = out.replaceAll(me, "You");
    const others = (state.turnOrder || []).filter((id) => id !== "AI" && id !== me);
    for (const oid of others) out = out.replaceAll(oid, "Opponent");
    return out;
  };

  // Emit facedown play
  const playFacedown = (row, col) => {
    socket.emit("playFacedown", roomCode, { row, col }, (res) => {
      if (!res.ok) return alert(res.error);
      setState({ ...res.state });
    });
  };

  // Selection summary
  const selectedCards = myHand.filter((c) => selected.has(c.id));
  const selectedRank =
    selectedCards.length > 0
      ? selectedCards.every((c) => c.rank === selectedCards[0].rank)
        ? selectedCards[0].rank
        : "mixed"
      : null;

    // ====== RENDER BY SCREEN ======

  if (screen === "home") {
    return (
      <HomeScreen
        onSingle={startSinglePlayer}
        onMulti={startMultiplayer}
        onTutorial={openTutorial}
      />
    );
  }

  if (screen === "loading") {
    // you can wire this later when you add real matchmaking
    return (
      <LoadingScreen
        onCancel={cancelMatchmaking}
      />
    );
  }

  if (screen === "tutorial") {
    return <TutorialScreen onBack={goHome} />;
  }

  // ====== IN-GAME UI ======
  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: 20 }}>
      {/* Top bar: title + quit button */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28 }}>Swish</h1>

        <button
          onClick={handleQuitToMenu}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: "#374151",
            color: "#e5e7eb",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Quit to Main Menu
        </button>
      </div>

      {/* Game over banner */}
      {state?.phase === "gameover" && (
        <div
          style={{
            margin: "12px 0",
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(46, 204, 113, .12)",
            border: "1px solid rgba(46, 204, 113, .4)",
            fontSize: 18,
            fontWeight: "bold",
          }}
        >
          Game Over:&nbsp;
          {state.winner === me
            ? "You win!"
            : state.winner === "AI"
            ? "AI wins!"
            : `Player ${state.winner?.slice(0, 4) || "Unknown"} wins!`}
        </div>
      )}

      <div style={{ display: "flex", gap: 24 }}>
        {/* LEFT COLUMN: Controls + Game Log */}
        <div style={{ minWidth: 320 }}>
          <h3>Controls</h3>
          {/* Start Game button REMOVED from UI on purpose */}

          <div style={{ marginTop: 8 }}>
            <strong>Your ID:</strong> {me || "—"}
          </div>

          <div>
            <strong>Active Player:</strong>{" "}
            {state?.activePlayer === "AI"
              ? "AI"
              : state?.activePlayer === me
              ? "You"
              : state?.activePlayer || "—"}
          </div>

          {/* Selection controls */}
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 6 }}>
              <strong>Selected:</strong>{" "}
              {selected.size === 0
                ? "(none)"
                : `${selected.size} ${
                    selectedRank ? `(${selectedRank})` : ""
                  }`}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={playSelected}
                disabled={!active || selected.size === 0}
                title="Play all selected cards"
              >
                Play Selected
              </button>
              <button
                onClick={selectSameRank}
                disabled={!active || selected.size === 0}
                title="Select all cards in your hand with the same rank as one selected card"
              >
                Select Same Rank
              </button>
              <button
                onClick={clearSelection}
                disabled={selected.size === 0}
                title="Clear selection"
              >
                Clear Selection
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
              Tip: <em>Click</em> to select/deselect; <em>double-click</em> a
              card to play just that one quickly.
            </div>
          </div>

          {/* Game Log */}
          <div style={{ marginTop: 18 }}>
            <h3>Game Log</h3>
            <div
              ref={setLogRef}
              style={{
                height: 200,
                overflowY: "auto",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                padding: "10px 12px",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,.25)",
              }}
            >
              {state?.log?.length ? (
                state.log.map((e, idx) => (
                  <div
                    key={e.t ?? idx}
                    style={{
                      fontSize: 13,
                      lineHeight: "18px",
                      marginBottom: 4,
                    }}
                  >
                    {humanizeMsg(e.msg)}
                  </div>
                ))
              ) : (
                <div style={{ color: "#777", fontSize: 12 }}>
                  (no events yet)
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Board */}
        <div style={{ flex: 1, minWidth: 420 }}>
          <h3>Your Hand</h3>
          {myHand.length === 0 ? (
            <div>(empty)</div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {myHand.map((card) => {
                const isSel = selected.has(card.id);
                return (
                  <Card
                    key={card.id}
                    card={card}
                    selected={isSel}
                    disabled={!active}
                    onClick={() => (active ? toggle(card.id) : null)}
                    onDoubleClick={() => (active ? playOne(card.id) : null)}
                  />
                );
              })}
            </div>
          )}

          {/* Facedown grid */}
          {myFace.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3>Facedown</h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 76px)",
                  gap: 8,
                }}
              >
                {myFace.map((col, r) =>
                  col.map((card, c) => (
                    <FacedownSlot
                      key={`${r}-${c}`}
                      enabled={!!card && canPlayFacedown}
                      onClick={() => playFacedown(r, c)}
                    />
                  ))
                )}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                Playable when your hand is empty and the deck is gone. Click
                one slot to flip &amp; try.
              </div>
            </div>
          )}

          {/* Discard + Deck row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginTop: 24,
              paddingTop: 8,
              borderTop: "1px solid rgba(0,0,0,.1)",
            }}
          >
            {/* Discard pile */}
            <div>
              <h3 style={{ marginBottom: 8 }}>Discard Pile</h3>
              <div style={{ position: "relative", width: 72, height: 104 }}>
                <CardBack
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    transform: "rotate(-2deg)",
                    opacity: 0.35,
                  }}
                />
                <CardBack
                  style={{
                    position: "absolute",
                    top: 4,
                    left: 4,
                    transform: "rotate(2deg)",
                    opacity: 0.5,
                  }}
                />
                <div style={{ position: "absolute", top: 0, left: 0 }}>
                  {top ? <Card card={top} disabled={true} /> : <CardBack />}
                </div>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
                {state?.discard?.length
                  ? `${state.discard.length} in pile`
                  : "(empty)"}
              </div>
            </div>

            {/* Draw deck */}
            <div style={{ textAlign: "right" }}>
              <h3 style={{ marginBottom: 8 }}>Draw Deck</h3>
              <div
                style={{
                  position: "relative",
                  width: 72,
                  height: 104,
                  marginLeft: "auto",
                }}
              >
                <CardBack
                  style={{
                    position: "absolute",
                    top: 6,
                    left: 6,
                    transform: "rotate(2deg)",
                    opacity: 0.5,
                  }}
                />
                <CardBack
                  style={{
                    position: "absolute",
                    top: 3,
                    left: 3,
                    transform: "rotate(-2deg)",
                    opacity: 0.75,
                  }}
                />
                <CardBack
                  style={{ position: "absolute", top: 0, left: 0 }}
                />
              </div>
              <div style={{ marginTop: 6, fontSize: 14 }}>
                <strong>{deckCount}</strong> left
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
