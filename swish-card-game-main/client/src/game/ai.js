// client/src/game/ai.js

// Decide which cards are playable vs the top of the pile:
export function getPlayableCards(hand, topCard, discardIsReset) {
  if (discardIsReset || !topCard) return hand.slice(); // free play after 2/10 or empty pile
  return hand.filter(c => c.value === 2 || c.value === 10 || c.value >= topCard.value);
}

// Simple policy: keep strong cards; play the lowest that works
export function pickLowestValue(cards) {
  return cards.slice().sort((a, b) => a.value - b.value)[0];
}

export async function aiTakeTurn(state, actions, delayMs = 700) {
  const { aiHand, discardPile, discardIsReset } = state;
  const topCard = discardPile[discardPile.length - 1] || null;

  await sleep(delayMs);

  const playable = getPlayableCards(aiHand, topCard, discardIsReset);

  if (playable.length === 0) {
    actions.setMessage("AI couldn't beat the top card and picked up the pile.");
    actions.pickUpPile('ai');
    await sleep(500);
    actions.endTurnTo('player');
    return;
  }

  const chosen = pickLowestValue(playable);
  actions.playCard(chosen);
  actions.setMessage(`AI played ${describeCard(chosen)}.`);

  // Power cards: AI immediately plays again
  if (chosen.value === 2) {
    await sleep(350);
    actions.setMessage("AI reset the pile with a 2 and will play again.");
    await aiTakeTurn(actions.getState(), actions, 500);
    return;
  }

  if (chosen.value === 10) {
    await sleep(250);
    actions.destroyPile();
    actions.setMessage("AI destroyed the pile with a 10 and will play again.");
    await sleep(350);
    await aiTakeTurn(actions.getState(), actions, 500);
    return;
  }

  await sleep(300);
  actions.endTurnTo('player');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function describeCard(card) {
  const rankMap = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const rank = rankMap[card.value] || card.value;
  return `${rank}${card.suit ? card.suit : ''}`;
}
