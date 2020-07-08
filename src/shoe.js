import Utils from './utils.js';
import Deck from './deck.js';
import GameObject from './game-object.js';
import DiscardTray from './discard-tray.js';
import Card from './card.js';
import BasicStrategyChecker from './basic-strategy-checker.js';

// When there are less than 20% cards in the shoe, a shuffle + reset is needed.
const RESET_THRESHOLD = 0.2;

// TODO: Make this mix in functionality from `DiscardTray` instead of extending.
export default class Shoe extends DiscardTray {
  constructor({ deckCount, gameMode } = {}) {
    super();

    console.assert(deckCount, 'Need to initialize Shoe with deckCount');
    console.assert(gameMode, 'Need to initialize Shoe with gameMode');

    this.hiLoRunningCount = 0;
    this.deckCount = deckCount;
    this.gameMode = gameMode;
    this.cards = this._setupCards();
    this.shuffle();
  }

  shuffle() {
    Utils.arrayShuffle(this.cards);

    if (this.gameMode === 'pairs') {
      const rank = Deck.randomRank();
      this._moveCardsToFront(rank, rank, null);
    }

    if (this.gameMode === 'uncommon') {
      const [chartType, chart] = Utils.arraySample(
        Object.entries(BasicStrategyChecker.uncommonHands(this.deckCount))
      );
      const [playerTotal, dealerUpcardRanks] = Utils.arraySample(
        Object.entries(chart)
      );
      const dealerUpcardRank = Utils.arraySample(dealerUpcardRanks);
      const [rank1, rank2] = this._twoRandomRanksFromTotal(
        playerTotal,
        chartType
      );

      this._moveCardsToFront(rank1, rank2, dealerUpcardRank);
    }
  }

  drawCard({ showingFace = true } = {}) {
    const card = this.cards.pop();
    card.showingFace = showingFace;

    if (showingFace) {
      this.hiLoRunningCount += card.hiLoValue;
    }

    this.emit('change');

    return card;
  }

  addCards(cards) {
    super.addCards(cards);

    this.hiLoRunningCount -= cards.reduce(
      (acc, card) => acc + card.hiLoValue,
      0
    );
  }

  attributes() {
    return Object.assign({}, super.attributes(), {
      penetration: Utils.round(this.penetration, 2),
      hiLoRunningCount: this.hiLoRunningCount,
      hiLoTrueCount: Utils.round(this.hiLoTrueCount, 2),
    });
  }

  get maxCards() {
    return this.deckCount * 52;
  }

  get needsReset() {
    if (this.gameMode === 'pairs' || this.gameMode === 'uncommon') {
      return true;
    }

    return this.cards.length / this.maxCards < RESET_THRESHOLD;
  }

  get cardsRemaining() {
    return this.cards.length / this.maxCards;
  }

  get penetration() {
    return (1 - this.cardsRemaining) * 100;
  }

  get decksRemaining() {
    return this.cardsRemaining * this.deckCount;
  }

  get hiLoTrueCount() {
    return this.hiLoRunningCount / this.decksRemaining;
  }

  _setupCards() {
    const decks = [];
    for (let i = 0; i < this.deckCount; i += 1) {
      decks.push(new Deck(this));
    }

    let cards = [];
    while (decks.length > 0) {
      cards = cards.concat(...decks.pop().cards);
    }

    return cards;
  }

  _moveCardsToFront(playerRank1, playerRank2, dealerUpcardRank) {
    // Move the first two cards to the 0th and 2nd spot so they are dealt to the
    // player at the start of the game.
    Utils.arrayMove(
      this.cards,
      this.cards.findIndex((card) => card.rank === playerRank1),
      this.cards.length - 1
    );

    if (dealerUpcardRank) {
      Utils.arrayMove(
        this.cards,
        this.cards.findIndex((card, i) => card.rank === dealerUpcardRank),
        this.cards.length - 1 - 1
      );
    }

    Utils.arrayMove(
      this.cards,
      this.cards.findIndex((card, i) => card.rank === playerRank2),
      this.cards.length - 1 - 2
    );
  }

  _twoRandomRanksFromTotal(total, chartType) {
    return this._twoRandomIntegerRanksFromTotal(
      parseInt(total),
      chartType
    ).map((r) => r.toString());
  }

  _twoRandomIntegerRanksFromTotal(total, chartType) {
    if (chartType === 'hard') {
      const rank = total > 11 ? 10 : 2;
      return [rank, total - rank];
    }

    if (chartType === 'soft') {
      return ['A', total - 11];
    }

    if (chartType === 'splits') {
      return [total, total];
    }
  }
}
