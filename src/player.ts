import Utils from './utils';
import { Events } from './event-emitter';
import GameObject from './game-object';
import Game from './game';
import Hand, { HandAttributes } from './hand';
import { Card } from './card';
import BasicStrategyChecker from './basic-strategy-checker';
import HiLoDeviationChecker from './hi-lo-deviation-checker';
import {
  HandWinner,
  Move,
  BlackjackPayout,
  PlayerStrategy,
  handWinnerToString,
  playerStrategyToString,
  moveToString,
} from './types';

type PlayerAttributes = {
  id: string;
  balance: number;
  hands: HandAttributes[];
  handWinner: { [id: string]: string };
};

export default class Player extends GameObject {
  static entityName = 'player';

  balance: number;
  blackjackPayout: BlackjackPayout;
  debug: boolean;
  handsCount: number;
  handsMax: number;
  handWinner: Map<string, HandWinner>;
  id: string;
  strategy: PlayerStrategy;

  _hands: Hand[];

  constructor({
    balance = 10000 * 100,
    blackjackPayout = BlackjackPayout.ThreeToTwo,
    debug = false,
    handsMax,
    strategy,
  }: {
    balance?: number;
    blackjackPayout?: BlackjackPayout;
    debug?: boolean;
    handsMax: number;
    strategy: PlayerStrategy;
  }) {
    super();

    this.balance = balance;
    this.blackjackPayout = blackjackPayout;
    this.debug = debug;
    this.handsCount = 0;
    this.handsMax = handsMax;
    this.handWinner = new Map();
    this.id = Utils.randomId();
    this.strategy = strategy;

    this._hands = Array.from({ length: handsMax }, () => {
      // TODO: Use `chainEmitChange`.
      const hand = new Hand(this);
      hand.on(Events.Change, () => this.emitChange());
      return hand;
    });
  }

  getHand(index: number): Hand {
    return this._hands[index];
  }

  eachHand(callback: (hand: Hand) => void): void {
    for (let i = 0; i < this.handsCount; i += 1) {
      callback(this._hands[i]);
    }
  }

  getNPCInput(game: Game, hand: Hand): Move {
    let correctMove: Move;

    if (this.strategy === PlayerStrategy.BasicStrategyI18) {
      correctMove =
        HiLoDeviationChecker.suggest(game, hand) ||
        BasicStrategyChecker.suggest(game, hand);
    } else {
      correctMove = BasicStrategyChecker.suggest(game, hand);
    }

    if (this.debug) {
      console.log(
        playerStrategyToString(this.strategy),
        this.id,
        handWinnerToString(HandWinner.Dealer),
        game.dealer.firstHand.serialize(),
        handWinnerToString(HandWinner.Player),
        hand.serialize(),
        `(${hand.cardTotal})`,
        moveToString(correctMove)
      );
    }

    return correctMove;
  }

  addHand(betAmount = 0, cards: Card[] = []): Hand {
    this.handsCount += 1;

    const hand = this._hands[this.handsCount - 1];
    hand.cards = cards;

    if (betAmount !== 0) {
      this.useChips(betAmount, { hand });
    }

    this.emitChange();

    return hand;
  }

  takeCard(
    card: Card,
    { hand, prepend = false }: { hand?: Hand; prepend?: boolean } = {}
  ): void {
    const targetHand = hand ?? this._hands[0];
    targetHand.takeCard(card, { prepend });

    if (this.debug) {
      console.log(
        Utils.titleCase((this.constructor as typeof GameObject).entityName),
        this.id,
        'draws card',
        targetHand.serialize({ showHidden: true }),
        `(${targetHand.cardTotal})`
      );
    }

    this.emitChange();
  }

  removeCards(): void {
    for (let i = 0; i < this.handsCount; i += 1) {
      this._hands[i].removeCards();
    }

    this.handsCount = 0;
  }

  attributes(): PlayerAttributes {
    // TODO: Get `Object.fromEntries` working when running `npm run test`.
    const handWinner: { [key: string]: string } = {};
    for (const key of this.handWinner.keys()) {
      const value = this.handWinner.get(key);
      if (value) {
        handWinner[key] = handWinnerToString(value);
      }
    }

    return {
      id: this.id,
      balance: this.balance,
      hands: this.hands.map((hand) => hand.attributes()),
      // handWinner: Object.fromEntries(this.handWinner),
      handWinner,
    };
  }

  useChips(betAmount: number, { hand }: { hand?: Hand } = {}): void {
    if (!hand) {
      hand = this._hands[0];
    }

    if (!hand) {
      throw new Error(`Player ${this.id} has no hand to add chips to`);
    }

    if (this.balance < hand.betAmount) {
      // TODO: Format cents.
      throw new Error(
        `Insufficient player balance: ${this.balance} < ${betAmount}`
      );
    }

    hand.betAmount += betAmount;
    this.balance -= betAmount;

    if (this.debug) {
      console.log(
        'Subtracted',
        betAmount,
        'from player',
        this.id,
        'balance:',
        this.balance
      );
    }
  }

  addChips(betAmount: number): void {
    this.balance += betAmount;

    if (this.debug) {
      console.log('Adding balance', this.id, this.balance, betAmount);
    }
  }

  setHandWinner({
    hand = this._hands[0],
    winner,
    surrender = false,
  }: {
    hand?: Hand;
    winner: HandWinner;
    surrender?: boolean;
  }): void {
    if (this.handWinner.has(hand.id)) {
      return;
    }

    this.handWinner.set(hand.id, winner);

    if (this.debug) {
      console.log(
        'Hand result',
        this.id,
        'winner:',
        winner,
        hand.blackjack ? 'blackjack' : ''
      );
    }

    if (winner === HandWinner.Player) {
      const [ratioNumerator, ratioDenominator] = hand.blackjack
        ? this._blackjackNumeratorDenominator()
        : [1, 1];

      this.addChips(
        hand.betAmount + hand.betAmount * (ratioNumerator / ratioDenominator)
      );
    } else if (winner === HandWinner.Push) {
      this.addChips(hand.betAmount);
    } else if (winner === HandWinner.Dealer && surrender) {
      this.addChips(hand.betAmount / 2);
    }

    this.emit(Events.HandWinner, hand, winner);
  }

  _blackjackNumeratorDenominator(): number[] {
    switch (this.blackjackPayout) {
      case BlackjackPayout.SixToFive:
        return [6, 5];
      case BlackjackPayout.ThreeToTwo:
        return [3, 2];
    }
  }

  get hands(): Hand[] {
    return this._hands.slice(0, this.handsCount);
  }

  get firstHand(): Hand {
    return this._hands[0];
  }

  get isUser(): boolean {
    return this.strategy === PlayerStrategy.UserInput;
  }

  get isNPC(): boolean {
    return !this.isUser;
  }

  // TODO: Consider using `Proxy`.
  get cards(): Card[] {
    return this._hands[0].cards;
  }

  // TODO: Consider using `Proxy`.
  get busted(): boolean {
    return this._hands[0].busted;
  }

  // TODO: Consider using `Proxy`.
  get blackjack(): boolean {
    return this._hands[0].blackjack;
  }

  // TODO: Consider using `Proxy`.
  get cardTotal(): number {
    return this._hands[0].cardTotal;
  }

  // TODO: Consider using `Proxy`.
  get hasPairs(): boolean {
    return this._hands[0].hasPairs;
  }

  // TODO: Consider using `Proxy`.
  get isSoft(): boolean {
    return this._hands[0].isSoft;
  }

  // TODO: Consider using `Proxy`.
  get isHard(): boolean {
    return this._hands[0].isHard;
  }
}
