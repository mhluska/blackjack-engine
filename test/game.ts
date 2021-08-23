import * as chai from 'chai';
import { Events } from '../src/event-emitter';
import Game, { GameSettings } from '../src/game';
import createCard from '../src/card';
import Utils from '../src/utils';
import {
  DeepPartial,
  Suit,
  Rank,
  GameStep,
  Move,
  HandWinner,
} from '../src/types';

type GameSetupOptions = {
  settings: DeepPartial<GameSettings>;
  cards: Rank[];
};

function setupGame(options: Partial<GameSetupOptions> = {}) {
  const defaults: GameSetupOptions = {
    settings: {
      debug: !!process.env.DEBUG,
      playerTablePosition: 1,
      playerCount: 1,
    },
    cards: [],
  };

  // TODO: Avoid `as` here. Otherwise returns `Partial<GameSetupOptions>`.
  const mergedOptions = Utils.mergeDeep(defaults, options) as GameSetupOptions;

  const game = new Game(mergedOptions.settings);
  const length = game.shoe.cards.length;

  mergedOptions.cards.forEach((cardRank: Rank, index: number) => {
    game.shoe.cards[length - index - 1] = createCard(Suit.Hearts, cardRank);
  });

  return game;
}

function runGame(
  game: Game,
  {
    repeatPlayerInput = false,
    input = [],
  }: {
    repeatPlayerInput?: boolean;
    input?: Partial<{ [key in GameStep]: Move }>[];
  } = {}
) {
  let callCount = 0;

  do {
    let playerInput: Move | undefined;

    const inputChoices = input[callCount];
    if (inputChoices) {
      playerInput = inputChoices[game.state.step];
    } else if (!repeatPlayerInput) {
      break;
    }

    if (!repeatPlayerInput) {
      if (playerInput) {
        callCount += 1;
      }
    }

    game.step(playerInput);
  } while (game.state.step !== GameStep.Start);
}

const expect = chai.expect;

describe('Game', function () {
  let game: Game;

  before(function () {
    game = setupGame();
  });

  describe('#run()', function () {
    const betAmount = 10 * 100;

    context('when the shoe needs to be reset', function () {
      let cardsBefore: number;

      before(function () {
        cardsBefore = game.shoe.cards.length;

        let shuffled = false;
        game.on(Events.Shuffle, () => (shuffled = true));

        while (!shuffled) {
          runGame(game, {
            repeatPlayerInput: true,
            input: [
              {
                [GameStep.WaitingForNewGameInput]: Move.Hit,
                [GameStep.WaitingForPlayInput]: Move.Hit,
                [GameStep.WaitingForInsuranceInput]: Move.NoInsurance,
              },
            ],
          });
        }
      });

      it('should move all the cards from the discard tray back to the shoe', function () {
        expect(cardsBefore).to.equal(game.shoe.cards.length);
      });

      it('should reset the hi-lo running count', function () {
        expect(game.shoe.hiLoRunningCount).to.equal(0);
      });
    });

    context('when the player bets and wins', function () {
      let playerBalanceBefore: number;

      const game = setupGame({
        // Force a winning hand for the player (blackjack with A-J).
        cards: [Rank.Ace, Rank.Two, Rank.Jack, Rank.Two],
      });

      before(function () {
        playerBalanceBefore = game.player.balance;

        game.betAmount = betAmount;

        runGame(game, {
          input: [
            {
              [GameStep.WaitingForNewGameInput]: Move.Hit,
            },
          ],
        });
      });

      it('should increase the player balance', function () {
        expect(game.player.balance).to.equal(
          playerBalanceBefore + betAmount * (3 / 2)
        );
      });
    });

    context('when autoDeclineInsurance is enabled', function () {
      let game: Game;

      before(function () {
        game = setupGame({
          settings: { autoDeclineInsurance: true },
          // Force a hand that prompts for insurance (dealer Ace).
          cards: [Rank.Two, Rank.Ace],
        });

        game.betAmount = betAmount;
        runGame(game, {
          repeatPlayerInput: true,
          input: [
            {
              [GameStep.WaitingForPlayInput]: Move.Hit,
              [GameStep.WaitingForNewGameInput]: Move.Hit,
            },
          ],
        });
      });

      it('should not pause for player input', function () {
        expect(game.state.step).not.to.equal('ask-insurance');
      });
    });

    context('when late surrender is enabled', function () {
      context('when only two cards are dealt', function () {
        before(function () {
          game = setupGame({
            settings: {
              allowLateSurrender: true,
            },
            cards: [Rank.Six, Rank.Queen, Rank.Jack, Rank.Jack],
          });

          game.betAmount = betAmount;

          runGame(game, {
            input: [
              {
                [GameStep.WaitingForPlayInput]: Move.Surrender,
              },
              {
                [GameStep.WaitingForNewGameInput]: Move.Hit,
              },
            ],
          });
        });

        it('should allow late surrender', function () {
          expect(game.state.step).to.equal(GameStep.Start);
          expect(game.player.handWinner.values().next().value).to.equal(
            HandWinner.Dealer
          );
        });
      });

      context('when more than two cards are dealt', function () {
        before(function () {
          game = setupGame({
            settings: {
              allowLateSurrender: true,
            },
            // Force a hand where the player has 16v10 and the next card will
            // not bust the player.
            cards: [Rank.Six, Rank.Queen, Rank.Jack, Rank.Jack, Rank.Two],
          });

          game.betAmount = betAmount;

          runGame(game, {
            input: [
              {
                [GameStep.WaitingForPlayInput]: Move.Hit,
              },
              {
                [GameStep.WaitingForPlayInput]: Move.Surrender,
              },
            ],
          });
        });

        it('should not allow late surrender', function () {
          expect(game.state.step).to.equal(GameStep.WaitingForPlayInput);
        });
      });
    });

    context('when resplit aces is disabled', function () {
      before(function () {
        game = setupGame({
          settings: {
            allowResplitAces: false,
          },
          // Force a hand where the player has AAv20 (the dealer total is
          // irrelevant).
          cards: [Rank.Ace, Rank.Queen, Rank.Ace, Rank.Jack],
        });

        game.betAmount = betAmount;

        runGame(game, {
          input: [
            {
              [GameStep.WaitingForPlayInput]: Move.Split,
            },
          ],
        });
      });

      it('should not allow spitting', function () {
        expect(game.player.hands).to.have.lengthOf(1);
      });
    });
  });
});
