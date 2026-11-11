/**
 * The ready-made shapes the clip-path tool offers, in percentages of the
 * reference box, like on bennettfeely.com/clippy.
 */

/** @typedef {{ name: string, value: string }} Preset */
/** @typedef {{ name: string, presets: Preset[] }} PresetGroup */

/** @param {[number, number][]} points in percentages */
const polygon = (points) =>
  `polygon(${points.map(([x, y]) => `${pc(x)} ${pc(y)}`).join(",")})`;

/** A percentage, `0` without its unit. */
const pc = (value) => (0 === value ? "0" : `${value}%`);

/**
 * Points around a center, the first one on top, stretched to fill the box.
 *
 * @param {number[]} radii one per point, repeated
 * @param {number} count how many points
 */
function around(count, radii = [1]) {
  const raw = Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count;
    const r = radii[i % radii.length];
    return [r * Math.sin(angle), -r * Math.cos(angle)];
  });
  const fit = (axis) => {
    const values = raw.map((point) => point[axis]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return (value) => Math.round(((value - min) / (max - min)) * 100);
  };
  const [x, y] = [fit(0), fit(1)];
  return raw.map(([px, py]) => [x(px), y(py)]);
}

const ARROW = [
  [0, 20],
  [60, 20],
  [60, 0],
  [100, 50],
  [60, 100],
  [60, 80],
  [0, 80],
];

/** @type {Preset[]} */
const POLYGONS = [
  { name: "Triangle", value: polygon(around(3)) },
  {
    name: "Trapezoid",
    value: polygon([
      [20, 0],
      [80, 0],
      [100, 100],
      [0, 100],
    ]),
  },
  {
    name: "Parallelogram",
    value: polygon([
      [25, 0],
      [100, 0],
      [75, 100],
      [0, 100],
    ]),
  },
  { name: "Rhombus", value: polygon(around(4)) },
  { name: "Pentagon", value: polygon(around(5)) },
  { name: "Hexagon", value: polygon(around(6)) },
  { name: "Heptagon", value: polygon(around(7)) },
  { name: "Octagon", value: polygon(around(8)) },
  { name: "Star", value: polygon(around(10, [1, 0.38])) },
  {
    name: "Cross",
    value: polygon([
      [35, 0],
      [65, 0],
      [65, 35],
      [100, 35],
      [100, 65],
      [65, 65],
      [65, 100],
      [35, 100],
      [35, 65],
      [0, 65],
      [0, 35],
      [35, 35],
    ]),
  },
  { name: "Arrow", value: polygon(ARROW) },
];

/** @type {Preset[]} */
const BASIC_SHAPES = [
  { name: "Circle", value: "circle(50%)" },
  { name: "Ellipse", value: "ellipse(50% 35%)" },
  { name: "Rectangle", value: "rect(15% 85% 85% 15%)" },
  { name: "Inset", value: "inset(15%)" },
  { name: "Box", value: "xywh(15% 15% 70% 70%)" },
];

/**
 * Shapes only shape() draws, each with other commands: curves, arcs,
 * horizontal and vertical lines.
 *
 * @type {Preset[]}
 */
const PATHS = [
  {
    name: "Heart",
    value:
      "shape(from 50% 100%,curve to 0 30% with 0 65%,curve to 50% 15% with 15% -5%,curve to 100% 30% with 85% -5%,curve to 50% 100% with 100% 65%,close)",
  },
  {
    name: "Leaf",
    value:
      "shape(from 0 100%,curve to 100% 0 with 0 0,curve to 0 100% with 100% 100%,close)",
  },
  {
    name: "Drop",
    value:
      "shape(from 50% 0,curve to 100% 50% with 100% 30%,arc to 0 50% of 50% cw,curve to 50% 0 with 0 30%,close)",
  },
  {
    name: "Shield",
    value:
      "shape(from 0 0,hline to 100%,vline to 50%,curve to 50% 100% with 100% 85%,curve to 0 50% with 0 85%,close)",
  },
  {
    name: "Arch",
    value:
      "shape(from 0 100%,vline to 50%,arc to 100% 50% of 50% cw,vline to 100%,close)",
  },
  {
    name: "Moon",
    value:
      "shape(from 80% 10%,arc to 80% 90% of 50% large,arc to 80% 10% of 45% cw,close)",
  },
  {
    name: "Ticket",
    value:
      "shape(from 0 0,hline to 100%,vline to 35%,arc by 0 30% of 15%,vline to 100%,hline to 0,vline to 65%,arc by 0 -30% of 15%,close)",
  },
  {
    name: "Wave",
    value:
      "shape(from 0 20%,curve to 50% 20% with 25% 0,smooth to 100% 20%,vline to 80%,curve to 50% 80% with 75% 100%,smooth to 0 80%,close)",
  },
  {
    name: "Cloud",
    value:
      "shape(from 25% 85%,arc to 20% 45% of 20% cw,arc to 50% 20% of 25% cw,arc to 80% 45% of 25% cw,arc to 75% 85% of 20% cw,close)",
  },
];

/**
 * The presets, a row each in the bar: polygons, the other basic shapes, then
 * those drawn with shape().
 *
 * @type {PresetGroup[]}
 */
export const PRESET_GROUPS = [
  { name: "Polygons", presets: POLYGONS },
  { name: "Circles and rectangles", presets: BASIC_SHAPES },
  { name: "Paths", presets: PATHS },
];

/** @type {Preset[]} */
export const PRESETS = PRESET_GROUPS.flatMap(({ presets }) => presets);
