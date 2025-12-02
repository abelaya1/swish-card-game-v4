export default function TutorialScreen({ onBack }) {
  return (
    <div className="screen">
      <div className="menu-card">
        <h2>How to Play</h2>
        <ul style={{ textAlign: "left" }}>
          <li>Play a card equal or higher than the top card.</li>
          <li><strong>2</strong> resets the pile. Play again.</li>
          <li><strong>10</strong> destroys the pile. Play again.</li>
          <li><strong>Ace</strong> beats everything.</li>
          <li>Four of a kind clears the pile.</li>
        </ul>

        <button className="menu-btn secondary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
