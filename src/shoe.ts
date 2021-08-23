import Utils from './utils';
import Deck from './deck';
import {
  value,
  rank,
  attributes,
  setShowingFace,
  hiLoValue,
  Card,
  CardAttributes,
} from './card';
import GameObject from './game-object';
import BasicStrategyChecker from './basic-strategy-checker';
import ExtendableError from './extendable-error';
import { illustrious18Deviations } from './hi-lo-deviation-checker';
import { GameSettings } from './game';
import {
  Rank,
  ChartType,
  cardValueToRank,
  rankToString,
  GameMode,
} from './types';

type ShoeAttributes = {
  cards: CardAttributes[];
  hiLoRunningCount: number;
  hiLoTrueCount: number;
  penetration: number;
};

export class OutOfCardsError extends ExtendableError {}

export default class Shoe extends GameObject {
  static entityName = 'shoe';

  cards!: Card[];
  currentCardIndex!: number;
  hiLoRunningCount!: number;
  settings: GameSettings;

  constructor({ settings }: { settings: GameSettings }) {
    super();

    this.settings = settings;
    this.setCards(this._setupCards(settings.deckCount));
    this.shuffle();
  }

  setCards(cards: Card[]): void {
    this.hiLoRunningCount = 0;
    this.currentCardIndex = cards.length - 1;

    for (const card of cards) {
      this.hiLoRunningCount -= hiLoValue(card);
      setShowingFace(card, false);
    }

    this.cards = cards;
    this.emitChange();
  }

  resetCards(): void {
    this.hiLoRunningCount = 0;
    this.currentCardIndex = this.cards.length - 1;
    this.shuffle();
  }

  shuffle(): void {
    Utils.arrayShuffle(this.cards);

    if (this.mode === GameMode.Pairs) {
      this._setupPairsMode();
    }

    if (this.mode === GameMode.Uncommon) {
      this._setupUncommonMode();
    }

    if (this.mode === GameMode.Illustrious18) {
      this._setupIllustrious18Mode();
    }

    if (this.debug) {
      console.log('Shoe shuffled');
    }
  }

  drawCard({ showingFace = true } = {}): Card {
    // This is an edge case that will rarely be reached during game mode. It can
    // happen if the pen is sufficiently deep and player count is large enough.
    // It does occur frequently in simulation mode where large amounts of hands
    // are played. Casinos seem to deal with it in varying ways. We handle it by
    // pushing all player hands and reshuffling.
    if (this.currentCardIndex < 0) {
      throw new OutOfCardsError();
    }

    const card = this.cards[this.currentCardIndex];

    this.currentCardIndex -= 1;

    setShowingFace(card, showingFace);

    if (showingFace) {
      this.hiLoRunningCount += hiLoValue(card);
    }

    this.emitChange();

    return card;
  }

  remainingCards(): Card[] {
    return this.cards.slice(0, this.currentCardIndex + 1);
  }

  attributes(): ShoeAttributes {
    return Object.assign(
      {},
      {
        penetration: Utils.round(this.penetration, 2),
        hiLoRunningCount: this.hiLoRunningCount,
        hiLoTrueCount: Utils.round(this.hiLoTrueCount, 2),
        cards: this.remainingCards().map((card) => attributes(card)),
      }
    );
  }

  serialize(): string {
    return (
      `(${this.cardCount} card${this.cardCount > 1 ? 's' : ''}): ` +
      this.remainingCards()
        .map((card) => rankToString(rank(card)))
        .reverse()
        .join(' ')
    );
  }

  get cardCount(): number {
    return this.currentCardIndex + 1;
  }

  get mode(): GameSettings['mode'] {
    return this.settings.mode;
  }

  get debug(): GameSettings['debug'] {
    return this.settings.debug;
  }

  get maxCards(): number {
    return this.settings.deckCount * 52;
  }

  get needsReset(): boolean {
    if (this.mode !== GameMode.Default) {
      return true;
    }

    return this.cardCount / this.maxCards < 1 - this.settings.penetration;
  }

  get cardsRemainingRatio(): number {
    return this.cardCount / this.maxCards;
  }

  get penetration(): number {
    return (1 - this.cardsRemainingRatio) * 100;
  }

  get decksRemaining(): number {
    return this.cardsRemainingRatio * this.settings.deckCount;
  }

  get hiLoTrueCount(): number {
    return this.hiLoRunningCount / this.decksRemaining;
  }

  _setupCards(deckCount: GameSettings['deckCount']): Card[] {
    const decks = [];
    for (let i = 0; i < deckCount; i += 1) {
      decks.push(new Deck(this));
    }

    let cards: Card[] = [];
    while (decks.length > 0) {
      const deck = decks.pop();
      if (deck) {
        cards = cards.concat(...deck.cards);
      }
    }

    return cards;
  }

  _moveCardsToFront(
    playerRank1: Rank,
    playerRank2: Rank,
    dealerUpcard?: number
  ): void {
    // Move the first two cards to the 0th and 2nd spot so they are dealt to the
    // player at the start of the game.
    Utils.arrayMove(
      this.cards,
      this.cards.findIndex((card) => rank(card) === playerRank1),
      this.cards.length - 1
    );

    if (dealerUpcard) {
      Utils.arrayMove(
        this.cards,
        this.cards.findIndex((card) => value(card) === dealerUpcard),
        this.cards.length - 1 - 1
      );
    }

    Utils.arrayMove(
      this.cards,
      this.cards.findIndex((card) => rank(card) === playerRank2),
      this.cards.length - 1 - 2
    );
  }

  _playerTotalToTwoCardRank(total: number, chartType: ChartType): [Rank, Rank] {
    const [rank1, rank2] = this._playerTotalToTwoCardValues(total, chartType);
    return [cardValueToRank(rank1), cardValueToRank(rank2)];
  }

  _playerTotalToTwoCardValues(
    total: number,
    chartType: ChartType
  ): [number, number] {
    switch (chartType) {
      case ChartType.Hard: {
        const value = total > 11 ? 10 : 2;
        return [value, total - value];
      }

      case ChartType.Soft:
        return [11, total - 11];

      default:
      case ChartType.Splits:
        return [total, total];
    }
  }

  _setupPairsMode(): void {
    const rank = Deck.randomRank();
    this._moveCardsToFront(rank, rank);
  }

  _setupUncommonMode(): void {
    const [chartType, chart] = Utils.arraySample(
      Array.from(BasicStrategyChecker.uncommonHands(this.settings).entries())
    );

    const [playerTotal, dealerUpcards] = Utils.arraySample(
      Array.from(chart.entries())
    );

    // TODO: Remove this once we have uncommon values defined for all charts.
    if (dealerUpcards.length === 0) {
      return;
    }

    const dealerUpcard = Utils.arraySample(dealerUpcards);
    const [rank1, rank2] = this._playerTotalToTwoCardRank(
      playerTotal,
      chartType
    );

    this._moveCardsToFront(rank1, rank2, dealerUpcard);
  }

  _setupIllustrious18Mode(): void {
    const {
      insurance,
      playerTotal,
      dealersCard,
      index,
      pair,
    } = Utils.arraySample(
      illustrious18Deviations.slice(0, this.settings.checkTopNDeviations)
    );

    let total = insurance ? Utils.random(2, 20) : playerTotal;

    // TODO: Make the splits format just equal the player total.
    if (pair) {
      total = total / 2;
    }

    const [rank1, rank2] = this._playerTotalToTwoCardRank(
      total,
      pair ? ChartType.Splits : ChartType.Hard
    );

    this._moveCardsToFront(rank1, rank2, dealersCard);

    // Include all face up cards in the count from the opening hand.
    const i1 = hiLoValue(this.cards[this.cards.length - 1]);
    const i2 = hiLoValue(this.cards[this.cards.length - 2]);
    const i3 = hiLoValue(this.cards[this.cards.length - 3]);

    // We artificially set the running count so that the true count works out
    // to what is required to act on the current illustrious 18 deviation. We
    // use the formula `true_count = running_count / decks_remaining`. We are
    // careful to subtract the next 3 cards from the running count since they
    // are about to be drawn by the dealer.
    let runningCount =
      index[1] *
        (((this.maxCards - 3) * this.settings.deckCount) / this.maxCards) -
      i1 -
      i2 -
      i3;

    // Since we forced the true count to a nice number, the running count will
    // be an ugly decimal. We round it up or down depending on whether the
    // illustrious 18 deviation acts on indices going further negative or
    // positive.
    runningCount = Math[index.includes('<') ? 'floor' : 'ceil'](runningCount);

    // Force the true count one point less for the '<' comparison since it
    // is an exclusive equality check.
    if (index.includes('<')) {
      runningCount -= this.decksRemaining;
    }

    // Half time time we randomly alter the running count to something
    // incorrect to be able to test the users knowledge.
    if (Utils.random(0, 1) === 0) {
      runningCount += this.decksRemaining * (index.includes('<') ? 1 : -1);
    }

    this.hiLoRunningCount = runningCount;
  }
}
