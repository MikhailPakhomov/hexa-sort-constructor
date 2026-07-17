const ROOT = "/game/hexa-sort/assets";

export const HEXA_SORT_ASSET_KEYS = {
  background: "hexa-sort-background",
  emptyHex: "hexa-sort-empty-hex",
  emptyHoverHex: "hexa-sort-empty-hover-hex",
  hexIndicatorIcon: "hexa-sort-hex-indicator-icon",
  hex1: "hexa-sort-hex-1", hex2: "hexa-sort-hex-2",
  hex3: "hexa-sort-hex-3", hex4: "hexa-sort-hex-4",
  hex5: "hexa-sort-hex-5", hex6: "hexa-sort-hex-6",
  hex7: "hexa-sort-hex-7", hex8: "hexa-sort-hex-8",
} as const;

export const HEXA_SORT_GAMEPLAY_ASSETS = [
  { key: HEXA_SORT_ASSET_KEYS.background, url: `${ROOT}/background.png` },
  { key: HEXA_SORT_ASSET_KEYS.emptyHex, url: `${ROOT}/empty.png` },
  { key: HEXA_SORT_ASSET_KEYS.emptyHoverHex, url: `${ROOT}/empty-hover.png` },
  { key: HEXA_SORT_ASSET_KEYS.hexIndicatorIcon, url: `${ROOT}/hex-indicator-icon.png` },
  ...Array.from({ length: 8 }, (_, index) => ({
    key: HEXA_SORT_ASSET_KEYS[`hex${index + 1}` as keyof typeof HEXA_SORT_ASSET_KEYS],
    url: `${ROOT}/editor-${index + 1}.png`,
  })),
];
