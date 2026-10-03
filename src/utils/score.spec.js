import { describe, expect, it } from "vitest";
import { computeScore, PERFECT_MATCH } from "./score";

describe("computeScore", () => {
  // Top solutions of the knowledge base, scored by cssbattle at 100%.
  it.each([
    [118, 729.91],
    [146, 699.48],
    [36, 883.82],
    [351, 614.1],
  ])("gives a %i characters perfect solution %f", (length, score) => {
    expect(computeScore(length, 1)).toBe(score);
  });

  it("counts a match from 99.98% as perfect", () => {
    expect(PERFECT_MATCH).toBe(0.9998);
    expect(computeScore(118, PERFECT_MATCH)).toBe(729.91);
  });

  it("scales an imperfect match by its cube", () => {
    // 729.91 × 0.99979³, to the cent.
    expect(computeScore(118, 0.99979)).toBe(599.99);
    expect(computeScore(118, 0.8)).toBe(373.71);
    expect(computeScore(118, 0.5)).toBe(91.24);
  });

  it("never gives an imperfect match more than 599.99", () => {
    expect(computeScore(1, 0.9997)).toBe(599.99);
  });

  it("gives nothing for no match at all", () => {
    expect(computeScore(118, 0)).toBe(0);
  });
});
