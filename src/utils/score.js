// cssbattle does not publish its formula. These constants come from ClawBattle
// (MIT, https://github.com/Beowolve/ClawBattle), which worked them out from
// real scores: they give the score of 859 of 863 top solutions to the cent.

/** The match from which cssbattle counts a solution as 100%. */
export const PERFECT_MATCH = 0.9998;

const FACTOR = 399.99725;
const BASE = 0.9905144;
const OFFSET = 599.9987;
const IMPERFECT_CAP = 599.99;
const EXPONENT = 3;

/**
 * The score cssbattle would give, as an estimate.
 *
 * @param {number} length Number of characters of the code
 * @param {number} match Between 0 and 1
 */
export function computeScore(length, match) {
  const perfect = cents(FACTOR * BASE ** length + OFFSET);
  if (match >= PERFECT_MATCH) {
    return perfect;
  }
  return Math.min(IMPERFECT_CAP, cents(perfect * match ** EXPONENT));
}

function cents(value) {
  return Math.round(value * 100) / 100;
}
