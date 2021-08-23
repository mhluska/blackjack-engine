import createCard, { Card } from './card';
import Utils from './utils';
import GameObject from './game-object';
import Shoe from './shoe';
import { Suit, Rank, enumValues } from './types';

export default class Deck extends GameObject {
  static entityName = 'deck';

  shoe: Shoe;
  cards: Card[];

  static randomSuit(): Suit {
    return Utils.arraySample(enumValues(Suit));
  }

  static randomRank(): Rank {
    return Utils.arraySample(enumValues(Rank));
  }

  constructor(shoe: Shoe) {
    super();

    this.shoe = shoe;
    this.cards = this.setupCards();
  }

  setupCards(): Card[] {
    const cards: Card[] = [];

    enumValues(Suit).forEach((suit) =>
      enumValues(Rank).forEach((rank) => cards.push(createCard(suit, rank)))
    );

    Utils.arrayShuffle(cards);

    return cards;
  }
}
