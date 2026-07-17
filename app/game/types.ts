export type HexaSortHexType = string;
export type HexaSortCellId = string;

export type HexaSortStackConfig = {
  id: string;
  items?: HexaSortHexType[];
  packId?: string;
  type?: "random";
};

export type HexaSortLevelConfig = {
  id: string;
  title: string;
  targetScore: number;
  target?: { type: "any" | "color"; colorId?: string };
  board: {
    columnCount?: number;
    rowCount?: number;
    rows: Array<{ columns: number[] }>;
    cells: Array<{ id: HexaSortCellId; row: number; slot: number; column: number }>;
  };
  initialStacks: Array<HexaSortStackConfig & { cellId: HexaSortCellId; blocker?: "lock"; unlockHexCount?: number }>;
  handStacks: HexaSortStackConfig[];
  stackQueue: HexaSortStackConfig[];
  randomQueue?: { packs: Array<{ packId: string; weight: number }> };
  library?: {
    colors?: Array<{ id: string; name: string; hex: string; sprite?: string }>;
    packs: Array<{ id: string; name: string; items: HexaSortHexType[] }>;
  };
};

export type GameResult = "victory" | "defeat";
