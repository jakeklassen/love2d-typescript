export type Color = [number, number, number];

const rgb = (r: number, g: number, b: number): Color => [r / 255, g / 255, b / 255];

/** The PICO-8 palette, in linear 0..1 love colors. */
export const Pico8 = {
  black: rgb(0, 0, 0),
  darkBlue: rgb(29, 43, 83),
  darkPurple: rgb(126, 37, 83),
  darkGreen: rgb(0, 135, 81),
  brown: rgb(171, 82, 54),
  darkGray: rgb(95, 87, 79),
  lightGray: rgb(194, 195, 199),
  white: rgb(255, 241, 232),
  red: rgb(255, 0, 77),
  orange: rgb(255, 163, 0),
  yellow: rgb(255, 236, 39),
  green: rgb(0, 228, 54),
  blue: rgb(41, 173, 255),
  lavender: rgb(131, 118, 156),
  pink: rgb(255, 119, 168),
  peach: rgb(255, 204, 170),
};

/** Deep-space background — a near-black blue. */
export const SPACE_COLOR: Color = rgb(6, 7, 18);

export type PlanetPalette = { dark: Color; base: Color; light: Color };

/** A few hand-picked planet "types": {shadow, midtone, lit}. */
export const PLANET_PALETTES: PlanetPalette[] = [
  { dark: Pico8.darkGray, base: Pico8.brown, light: Pico8.orange }, // rocky
  { dark: Pico8.darkBlue, base: Pico8.blue, light: Pico8.lightGray }, // ocean
  { dark: Pico8.brown, base: Pico8.orange, light: Pico8.yellow }, // gas giant
  { dark: Pico8.darkPurple, base: Pico8.lavender, light: Pico8.lightGray }, // ice
  { dark: Pico8.darkGreen, base: Pico8.green, light: Pico8.yellow }, // verdant
  { dark: Pico8.darkPurple, base: Pico8.pink, light: Pico8.peach }, // exotic
];
