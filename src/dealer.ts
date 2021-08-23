import Player from './player';
import { Card } from './card';

export default class Dealer extends Player {
  static entityName = 'dealer';

  get upcard(): Card {
    // TODO: Remove use of `as`. Will have to preinitialize dealer with cards.
    return this.cards[1] as Card;
  }

  get holeCard(): Card {
    // TODO: Remove use of `as`. Will have to preinitialize dealer with cards.
    return this.cards[0] as Card;
  }
}
