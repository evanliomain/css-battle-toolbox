import { describe, expect, it } from "vitest";
import { addModulo, subModulo } from "./add-modulo";

describe("addModulo/subModulo", () => {
  it.each`
    n     | modulo | expectedPlus | expectedMoins
    ${5}  | ${3}   | ${0}         | ${1}
    ${7}  | ${5}   | ${3}         | ${1}
    ${0}  | ${3}   | ${1}         | ${2}
    ${0}  | ${5}   | ${1}         | ${4}
    ${5}  | ${100} | ${6}         | ${4}
    ${1}  | ${3}   | ${2}         | ${0}
  `(
    "#%# $n + 1 [$modulo] = $expectedPlus, $n - 1 [$modulo] = $expectedMoins",
    ({ n, modulo, expectedPlus, expectedMoins }) => {
      expect(addModulo(n, modulo)).toEqual(expectedPlus);
      expect(subModulo(n, modulo)).toEqual(expectedMoins);
    },
  );
});
