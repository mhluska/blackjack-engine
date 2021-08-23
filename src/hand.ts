import GameObject from './game-object';
import Utils from './utils';
import Player from './player';
import {
  rank,
  value,
  showingFace,
  attributes,
  Card,
  CardAttributes,
} from './card';
import { Rank, rankToString } from './types';

export type HandAttributes = {
  id: string;
  cards: CardAttributes[];
  hasPairs: boolean;
  cardTotal: number;
  blackjack: boolean;
  firstMove: boolean;
};

export default class Hand extends GameObject {
  static entity = 'hand';

  acesCount!: number;
  betAmount!: number;
  cardHighTotal!: number;
  cardLowTotal!: number;
  cards!: Card[];
  fromSplit!: boolean;
  id: string;
  player: Player;

  constructor(player: Player, cards: Card[] = []) {
    super();

    this.reset();

    this.id = Utils.randomId();
    this.player = player;

    for (const card of cards) {
      this.takeCard(card);
    }
  }

  reset(): void {
    this.acesCount = 0;
    this.betAmount = 0;
    this.cardHighTotal = 0;
    this.cardLowTotal = 0;
    this.cards = [];
    this.fromSplit = false;
  }

  takeCard(card: Card, { prepend = false } = {}): void {
    if (prepend) {
      this.cards.unshift(card);
    } else {
      this.cards.push(card);
    }

    if (showingFace(card)) {
      this.incrementTotalsForCard(card);
    }

    this.emitChange();
  }

  removeCard(): Card | void {
    const card = this.cards.pop();

    if (!card) {
      return;
    }

    this.decrementTotalsForCard(card);

    return card;
  }

  incrementTotalsForCard(card: Card): void {
    this.cardHighTotal += value(card);
    this.cardLowTotal += rank(card) === Rank.Ace ? 1 : value(card);

    if (rank(card) === Rank.Ace) {
      this.acesCount += 1;
    }
  }

  decrementTotalsForCard(card: Card): void {
    this.cardHighTotal -= value(card);
    this.cardLowTotal -= rank(card) === Rank.Ace ? 1 : value(card);

    if (rank(card) === Rank.Ace) {
      this.acesCount -= 1;
    }
  }

  // TODO: Remove change handler when removing cards.
  removeCards(): Card[] {
    const cards = this.cards;

    this.reset();
    this.emitChange();

    return cards;
  }

  serialize({ showHidden = false } = {}): string {
    return this.cards
      .map((card) =>
        showingFace(card) || showHidden ? rankToString(rank(card)) : '?'
      )
      .join(' ');
  }

  attributes(): HandAttributes {
    return {
      id: this.id,
      cards: this.cards.map((card) => attributes(card)),
      hasPairs: this.hasPairs,
      cardTotal: this.cardTotal,
      blackjack: this.blackjack,
      firstMove: this.firstMove,
    };
  }

  get cardTotal(): number {
    return this.cardHighTotal > 21 ? this.cardLowTotal : this.cardHighTotal;
  }

  get firstMove(): boolean {
    return this.cards.length <= 2;
  }

  get busted(): boolean {
    return this.cardTotal > 21;
  }

  get blackjack(): boolean {
    return (
      this.cards.length === 2 && this.cardHighTotal === 21 && !this.fromSplit
    );
  }

  get finished(): boolean {
    return this.busted || this.blackjack;
  }

  get hasPairs(): boolean {
    return (
      this.cards.length === 2 && value(this.cards[0]) === value(this.cards[1])
    );
  }

  // A hand is "soft" if there is an ace and the next card will not bust:
  // 1. there's at least one ace
  // 2. counting the aces as value 1, the total is <= 11
  get isSoft(): boolean {
    return this.acesCount > 0 && this.cardLowTotal <= 11;
  }

  get isHard(): boolean {
    return !this.isSoft;
  }

  get hasAces(): boolean {
    return (
      this.cards.length === 2 &&
      rank(this.cards[0]) === Rank.Ace &&
      rank(this.cards[1]) === Rank.Ace
    );
  }
}
