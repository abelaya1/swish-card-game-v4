// client/src/components/HomeScreen.jsx
export default function HomeScreen({ onSingle, onMulti, onTutorial }) {
  return (
    <div
      style={{
        position: "fixed",     // lock to viewport
        inset: 0,              // top:0, right:0, bottom:0, left:0
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background:
          "linear-gradient(135deg, #050816 0%, #0b1120 40%, #020617 100%)",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          background: "#111827",
          borderRadius: 24,
          width: "100%",
          maxWidth: 420,
          padding: "32px 28px 40px",
          boxShadow: "0 18px 45px rgba(0,0,0,0.55)",
        }}
      >
        <h1
          style={{
            color: "#ffffff",
            fontSize: 36,
            fontWeight: 800,
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          Swish
        </h1>

        <button
          onClick={onSingle}
          style={{
            width: "100%",
            padding: "14px 0",
            marginBottom: 12,
            borderRadius: 10,
            border: "none",
            background: "#2563eb",
            color: "#ffffff",
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Single Player
        </button>

        <button
          onClick={onMulti}
          style={{
            width: "100%",
            padding: "14px 0",
            marginBottom: 12,
            borderRadius: 10,
            border: "none",
            background: "#1d4ed8",
            color: "#ffffff",
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Multiplayer
        </button>

        <button
          onClick={onTutorial}
          style={{
            width: "100%",
            padding: "14px 0",
            marginTop: 4,
            borderRadius: 10,
            border: "none",
            background: "#374151",
            color: "#e5e7eb",
            fontSize: 15,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Tutorial
        </button>
      </div>
    </div>
  );
}
