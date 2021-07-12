import * as chai from 'chai';

import Simulator from '../src/simulator';

const expect = chai.expect;

describe('Simulator', function () {
  let simulator: Simulator;

  before(function () {
    simulator = new Simulator({ debug: !!process.env.DEBUG });
  });

  describe('#run()', function () {
    it('runs', async function () {
      const result = await simulator.run({ hands: 10 ** 3 });

      expect(result).to.have.all.keys(
        'timeElapsed',
        'amountEarned',
        'amountEarnedVariance',
        'amountWagered',
        'handsWon',
        'handsLost',
        'handsPushed',
        'handsPlayed',
        'houseEdge'
      );
    });
  });
});