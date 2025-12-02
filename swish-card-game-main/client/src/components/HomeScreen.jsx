import "./HomeScreen.css";

export default function HomeScreen({ onSingle, onMulti, onTutorial }) {
  return (
    <div className="screen home-screen">
      <div className="menu-card">
        <h1 className="title">Swish</h1>

        <button className="menu-btn" onClick={onSingle}>
          Single Player
        </button>

        <button className="menu-btn" onClick={onMulti}>
          Multiplayer
        </button>

        <button className="menu-btn secondary" onClick={onTutorial}>
          Tutorial
        </button>
      </div>
    </div>
  );
}
