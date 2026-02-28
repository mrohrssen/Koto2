import { describe, it } from 'node:test';
import assert from 'node:assert';
import { instantiateRobot, addXpToRobot, xpToNextLevel } from '../../../src/game/robots.js';

describe('Exploration XP - Cubic Curve Integration', () => {
  it('shrine grants exactly 1 level when given xpToNextLevel(robotLevel)', () => {
    const robot = instantiateRobot('hikaribon');
    robot.level = 5;
    robot.xp = 0;

    const xpNeeded = xpToNextLevel(robot.level); // L5->L6 = 91
    addXpToRobot(robot, xpNeeded);

    assert.strictEqual(robot.level, 6);
    assert.strictEqual(robot.xp, 0);
  });

  it('shrine grants exactly 1 level even at high levels', () => {
    const robot = instantiateRobot('hikaribon');
    robot.level = 20;
    robot.xp = 0;

    const xpNeeded = xpToNextLevel(robot.level);
    addXpToRobot(robot, xpNeeded);

    assert.strictEqual(robot.level, 21);
    assert.strictEqual(robot.xp, 0);
  });

});
