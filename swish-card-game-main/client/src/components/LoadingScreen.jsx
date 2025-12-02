export default function LoadingScreen({ onCancel }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      color: "#fff"
    }}>
      <h2>Searching for players...</h2>

      <button
        onClick={onCancel}
        style={{
          marginTop: 20,
          padding: "10px 20px",
          background: "#c0392b",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 16
        }}
      >
        Cancel
      </button>
    </div>
  );
}
