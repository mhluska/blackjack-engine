import * as chai from 'chai';

import Shoe from '../src/shoe';
import createCard, { Card, suit } from '../src/card';
import { Suit, Rank } from '../src/types';

import { settings } from './mocks';

const expect = chai.expect;

describe('Shoe', function () {
  let shoe: Shoe;
  let cards: Card[];

  beforeEach(function () {
    shoe = new Shoe({ settings });
    cards = [
      createCard(Suit.Hearts, Rank.Ace),
      createCard(Suit.Diamonds, Rank.Ace),
      createCard(Suit.Clubs, Rank.Ace),
      createCard(Suit.Spades, Rank.Ace),
    ];
    shoe.setCards(cards);
  });

  it('adds and draws cards', function () {
    shoe.drawCard();

    const card = shoe.drawCard();
    expect(suit(card)).equals(Suit.Clubs);
  });

  it('gets shoe attributes', function () {
    const attributes = shoe.attributes();
    expect(attributes.cards.length).equals(cards.length);
  });
});
