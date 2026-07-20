"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { HexaSortLevelConfig } from "./game/types";

const GamePreview = dynamic(() => import("./game/GamePreview"), { ssr: false });

type Color = { id: string; name: string; hex: string; sprite: string };
type Pack = { id: string; name: string; items: string[] };
type Placement = { packId: string; locked: boolean; unlockHexCount?: number };
type EmptyCellLock = { unlockHexCount: number };
type QueueItem = { kind: "pack"; packId: string } | { kind: "random" };
type RandomPack = { packId: string; weight: number };
type LevelSnapshot = {
  levelId: string;
  title: string;
  targetScore: number;
  targetType: "any" | "color";
  targetColor: string;
  columnCount: number;
  rowCount: number;
  active: string[];
  placements: Record<string, Placement>;
  emptyCellLocks: Record<string, EmptyCellLock>;
  colors: Color[];
  packs: Pack[];
  selectedPack: string;
  queue: QueueItem[];
  randomPacks: RandomPack[];
};
type SavedLevel = { id: string; title: string; updatedAt: string; snapshot: LevelSnapshot };

const SAVED_LEVELS_KEY = "hexa-sort-constructor:saved-levels";

const INITIAL_COLORS: Color[] = [
  { id: "1", name: "Розовый", hex: "#ff3fa3", sprite: "hex-pink" },
  { id: "2", name: "Голубой", hex: "#08afe3", sprite: "hex-cyan" },
  { id: "3", name: "Зелёный", hex: "#82ed00", sprite: "hex-green" },
  { id: "4", name: "Жёлтый", hex: "#ffd400", sprite: "hex-yellow" },
  { id: "5", name: "Синий", hex: "#1760f2", sprite: "hex-blue" },
  { id: "6", name: "Красный", hex: "#f5143e", sprite: "hex-red" },
  { id: "7", name: "Тёмно-синий", hex: "#172140", sprite: "hex-dark-blue" },
  { id: "8", name: "Белый", hex: "#d9ebff", sprite: "hex-white" },
];

const INITIAL_PACKS: Pack[] = [
  { id: "pack-yellow-3", name: "3 жёлтых", items: ["4", "4", "4"] },
  { id: "pack-red-3", name: "3 красных", items: ["6", "6", "6"] },
  { id: "pack-mix-3", name: "Микс", items: ["1", "2", "3"] },
];

const INITIAL_RANDOM_PACKS: RandomPack[] = [
  { packId: "pack-yellow-3", weight: 10 },
  { packId: "pack-red-3", weight: 10 },
  { packId: "pack-mix-3", weight: 10 },
];

const DEFAULT_CELLS = [
  "0:2",
  "1:1", "1:2",
  "2:1", "2:2", "2:3",
  "3:1", "3:2",
  "4:1", "4:2", "4:3",
  "5:1", "5:2",
  "6:1", "6:2", "6:3",
  "7:1", "7:2",
  "8:2",
];

const DEFAULT_COLUMN_COUNT = 5;
const DEFAULT_ROW_COUNT = 9;
const MIN_BOARD_SIZE = 2;
const MAX_COLUMN_COUNT = 12;
const MAX_ROW_COUNT = 16;

function cellId(row: number, slot: number) {
  return `${row}:${slot}`;
}

function cellColumn(row: number, slot: number, columnCount: number) {
  return slot * 2 - (columnCount - 1) + (row % 2);
}

function slotsInRow(row: number, columnCount: number) {
  return columnCount - (row % 2);
}

function makeRows(active: Set<string>, rowCount: number, columnCount: number) {
  return Array.from({ length: rowCount }, (_, row) => ({
    columns: Array.from({ length: slotsInRow(row, columnCount) }, (_, slot) => cellId(row, slot))
      .filter((id) => active.has(id))
      .map((id) => cellColumn(row, Number(id.split(":")[1]), columnCount)),
  }));
}

function createLevelConfig(snapshot: LevelSnapshot): HexaSortLevelConfig {
  const { active: activeCellIds, colors, columnCount, emptyCellLocks = {}, levelId, packs, placements, queue, randomPacks, rowCount, targetColor, targetScore, targetType, title } = snapshot;
  const active = new Set(activeCellIds);
  const rows = makeRows(active, rowCount, columnCount);
  const boardCells = rows.flatMap(({ columns }, row) => columns.map((column, slot) => ({ id: `${row}:${slot}`, row, slot, column })));
  const exportedCellIds = new Map<string, string>();

  Array.from({ length: rowCount }, (_, row) => {
    const activeSlots = Array.from({ length: slotsInRow(row, columnCount) }, (_, slot) => slot)
      .filter((slot) => active.has(cellId(row, slot)));
    activeSlots.forEach((gridSlot, exportSlot) => exportedCellIds.set(cellId(row, gridSlot), `${row}:${exportSlot}`));
  });

  const hardPacks = queue.map((item, index) => item.kind === "random"
    ? { id: `queue-random-${index + 1}`, type: "random" as const }
    : { id: `queue-stack-${index + 1}`, packId: item.packId, items: packs.find((pack) => pack.id === item.packId)?.items ?? [] });

  return {
    id: levelId,
    title,
    targetScore,
    target: { type: targetType, ...(targetType === "color" ? { colorId: targetColor } : {}) },
    board: { columnCount, rowCount, rows, cells: boardCells.map((cell) => {
      const editorCellId = Array.from(exportedCellIds.entries()).find(([, exportedId]) => exportedId === cell.id)?.[0];
      const lock = editorCellId ? emptyCellLocks[editorCellId] : undefined;
      return { ...cell, ...(lock ? { blocker: "lock" as const, unlockHexCount: lock.unlockHexCount } : {}) };
    }) },
    initialStacks: Object.entries(placements)
      .filter(([id]) => active.has(id))
      .map(([id, placement], index) => ({ id: `board-stack-${index + 1}`, cellId: exportedCellIds.get(id) ?? id, packId: placement.packId, items: packs.find((pack) => pack.id === placement.packId)?.items ?? [], ...(placement.locked ? { blocker: "lock" as const, unlockHexCount: placement.unlockHexCount ?? 10 } : {}) })),
    handStacks: hardPacks.slice(0, 3).map((stack, index) => ({ ...stack, id: `hand-stack-${index + 1}` })),
    stackQueue: hardPacks.slice(3),
    randomQueue: { packs: randomPacks.filter((entry) => entry.weight > 0 && packs.some((pack) => pack.id === entry.packId)).map((entry) => ({ packId: entry.packId, weight: entry.weight })) },
    library: { colors, packs },
  };
}

function safeFileName(value: string) {
  return value.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/[. ]+$/g, "") || "level";
}

function PieceStack({ items, colors, small = false }: { items: string[]; colors: Color[]; small?: boolean }) {
  return (
    <span className={`piece-stack ${small ? "small" : ""}`} aria-label={`${items.length} элементов`}>
      {items.slice(-5).map((colorId, index) => (
        <i key={index} style={{ background: colors.find((color) => color.id === colorId)?.hex ?? "#bbb", bottom: index * (small ? 3 : 4) }} />
      ))}
      {items.length > 0 && <b>{items.length}</b>}
    </span>
  );
}

export default function LevelConstructor() {
  const [colors, setColors] = useState(INITIAL_COLORS);
  const [packs, setPacks] = useState(INITIAL_PACKS);
  const [active, setActive] = useState(new Set(DEFAULT_CELLS));
  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  const [emptyCellLocks, setEmptyCellLocks] = useState<Record<string, EmptyCellLock>>({});
  const [selectedPack, setSelectedPack] = useState(INITIAL_PACKS[0].id);
  const [columnCount, setColumnCount] = useState(DEFAULT_COLUMN_COUNT);
  const [rowCount, setRowCount] = useState(DEFAULT_ROW_COUNT);
  const [levelId, setLevelId] = useState("level-1");
  const [title, setTitle] = useState("Уровень 1");
  const [targetScore, setTargetScore] = useState(150);
  const [targetType, setTargetType] = useState<"any" | "color">("any");
  const [targetColor, setTargetColor] = useState("1");
  const [queue, setQueue] = useState<QueueItem[]>([
    { kind: "pack", packId: "pack-yellow-3" },
    { kind: "pack", packId: "pack-red-3" },
    { kind: "pack", packId: "pack-mix-3" },
  ]);
  const [randomPacks, setRandomPacks] = useState<RandomPack[]>(INITIAL_RANDOM_PACKS);
  const [notice, setNotice] = useState("");
  const [contextMenu, setContextMenu] = useState<{ cellId: string; x: number; y: number } | null>(null);
  const [packDraft, setPackDraft] = useState<{ id?: string; name: string; items: string[] } | null>(null);
  const [colorDraft, setColorDraft] = useState<{ originalId?: string; id: string; name: string; hex: string } | null>(null);
  const [draggingPackId, setDraggingPackId] = useState<string | null>(null);
  const [dragTargetCell, setDragTargetCell] = useState<string | null>(null);
  const [savedLevels, setSavedLevels] = useState<SavedLevel[]>([]);
  const [selectedSavedLevel, setSelectedSavedLevel] = useState("");
  const [testLevel, setTestLevel] = useState<HexaSortLevelConfig | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(SAVED_LEVELS_KEY);
        if (stored) setSavedLevels(JSON.parse(stored) as SavedLevel[]);
      } catch {
        setNotice("Не удалось прочитать сохранённые уровни");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const initialHand = useMemo(() => Array.from({ length: 3 }, (_, index) => queue[index] ?? null), [queue]);
  const randomWeightTotal = useMemo(() => randomPacks.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0), [randomPacks]);
  const config = useMemo(() => createLevelConfig({
    levelId, title, targetScore, targetType, targetColor, columnCount, rowCount,
    active: [...active], placements, emptyCellLocks, colors, packs, selectedPack, queue, randomPacks,
  }), [active, colors, columnCount, emptyCellLocks, levelId, packs, placements, queue, randomPacks, rowCount, selectedPack, targetColor, targetScore, targetType, title]);

  function resizeBoard(nextColumnCount: number, nextRowCount: number) {
    const columns = Math.min(MAX_COLUMN_COUNT, Math.max(MIN_BOARD_SIZE, nextColumnCount));
    const rows = Math.min(MAX_ROW_COUNT, Math.max(MIN_BOARD_SIZE, nextRowCount));
    const isInside = (id: string) => {
      const [row, slot] = id.split(":").map(Number);
      return row < rows && slot < slotsInRow(row, columns);
    };

    setColumnCount(columns);
    setRowCount(rows);
    setActive((current) => new Set([...current].filter(isInside)));
    setPlacements((current) => Object.fromEntries(Object.entries(current).filter(([id]) => isInside(id))));
    setEmptyCellLocks((current) => Object.fromEntries(Object.entries(current).filter(([id]) => isInside(id))));
    setContextMenu((current) => current && isInside(current.cellId) ? current : null);
  }

  function toggleCell(id: string) {
    setActive((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        setPlacements((value) => { const copy = { ...value }; delete copy[id]; return copy; });
        setEmptyCellLocks((value) => { const copy = { ...value }; delete copy[id]; return copy; });
      } else next.add(id);
      return next;
    });
  }

  function handleBoardClick(id: string) {
    setContextMenu(null);
    toggleCell(id);
  }

  function toggleLock(id: string) {
    const placement = placements[id];
    if (placement) {
      setPlacements((value) => ({ ...value, [id]: { ...placement, locked: !placement.locked, unlockHexCount: placement.unlockHexCount ?? 10 } }));
    } else if (active.has(id)) {
      setEmptyCellLocks((value) => {
        const next = { ...value };
        if (next[id]) delete next[id];
        else next[id] = { unlockHexCount: 10 };
        return next;
      });
    }
    setContextMenu(null);
  }

  function updateUnlockHexCount(id: string, count: number) {
    const unlockHexCount = Math.max(1, Math.round(count) || 1);
    if (placements[id]) setPlacements((current) => ({ ...current, [id]: { ...current[id], unlockHexCount } }));
    else setEmptyCellLocks((current) => current[id] ? { ...current, [id]: { unlockHexCount } } : current);
  }

  function savePack() {
    if (!packDraft || packDraft.items.length === 0) return;
    if (packDraft.id) {
      const id = packDraft.id;
      setPacks((value) => value.map((pack) => pack.id === id ? { ...pack, name: packDraft.name.trim() || pack.name, items: packDraft.items } : pack));
      setSelectedPack(id);
      setPackDraft(null);
      return;
    }
    let sequence = packs.length + 1;
    while (packs.some((pack) => pack.id === `pack-${sequence}`)) sequence += 1;
    const id = `pack-${sequence}`;
    setPacks((value) => [...value, { id, name: packDraft.name.trim() || `Новая пачка ${sequence}`, items: packDraft.items }]);
    setSelectedPack(id);
    setPackDraft(null);
  }

  function openColorEditor() {
    let sequence = colors.length + 1;
    while (colors.some((color) => color.id === `color-${sequence}`)) sequence += 1;
    setColorDraft({ id: `color-${sequence}`, name: "Новый цвет", hex: "#8b5cf6" });
  }

  function editColor(color: Color) {
    setColorDraft({ originalId: color.id, id: color.id, name: color.name, hex: color.hex });
  }

  function saveColor() {
    const id = colorDraft?.id.trim() ?? "";
    if (!colorDraft || !id || !colorDraft.name.trim() || colors.some((color) => color.id === id && color.id !== colorDraft.originalId)) return;
    const nextColor = { id, name: colorDraft.name.trim(), hex: colorDraft.hex, sprite: `hex-custom-${id}` };
    if (colorDraft.originalId) {
      const originalId = colorDraft.originalId;
      setColors((value) => value.map((color) => color.id === originalId ? nextColor : color));
      if (originalId !== id) {
        setPacks((value) => value.map((pack) => ({ ...pack, items: pack.items.map((colorId) => colorId === originalId ? id : colorId) })));
        setTargetColor((value) => value === originalId ? id : value);
      }
    } else {
      setColors((value) => [...value, nextColor]);
    }
    setColorDraft(null);
  }

  function deleteColor(colorIdFromList?: string) {
    const colorId = colorIdFromList ?? colorDraft?.originalId;
    if (!colorId || colors.length <= 1) return;
    const color = colors.find((item) => item.id === colorId);
    const affectedPacks = packs.filter((pack) => pack.items.includes(colorId));
    const confirmed = window.confirm(affectedPacks.length > 0
      ? `Цвет «${color?.name ?? colorId}» используется в ${affectedPacks.length} пачках. Удалить его из палитры и из состава этих пачек? Пустые пачки также будут удалены.`
      : `Удалить цвет «${color?.name ?? colorId}» из палитры?`);
    if (!confirmed) return;

    const nextPacks = packs
      .map((pack) => ({ ...pack, items: pack.items.filter((item) => item !== colorId) }))
      .filter((pack) => pack.items.length > 0);
    const nextPackIds = new Set(nextPacks.map((pack) => pack.id));
    const fallbackPackId = nextPacks[0]?.id ?? "";
    const fallbackColorId = colors.find((item) => item.id !== colorId)?.id ?? "";

    setColors((value) => value.filter((item) => item.id !== colorId));
    setPacks(nextPacks);
    setPlacements((value) => Object.fromEntries(Object.entries(value).filter(([, placement]) => nextPackIds.has(placement.packId))));
    setQueue((value) => value.filter((item) => item.kind === "random" || nextPackIds.has(item.packId)));
    setRandomPacks((value) => value.filter((item) => nextPackIds.has(item.packId)));
    setSelectedPack((value) => nextPackIds.has(value) ? value : fallbackPackId);
    setTargetColor((value) => value === colorId ? fallbackColorId : value);
    setColorDraft(null);
    setNotice("Цвет удалён");
    window.setTimeout(() => setNotice(""), 2200);
  }

  function dropPack(id: string, packId: string) {
    if (!active.has(id) || emptyCellLocks[id] || !packs.some((pack) => pack.id === packId)) return;
    setPlacements((current) => ({ ...current, [id]: { packId, locked: false, unlockHexCount: 10 } }));
    setSelectedPack(packId);
    setDragTargetCell(null);
  }

  function addRandomPack() {
    setRandomPacks((current) => {
      const packId = current.some((entry) => entry.packId === selectedPack)
        ? packs.find((pack) => !current.some((entry) => entry.packId === pack.id))?.id
        : selectedPack;
      return packId ? [...current, { packId, weight: 10 }] : current;
    });
  }

  function updateRandomPack(index: number, patch: Partial<RandomPack>) {
    setRandomPacks((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry));
  }

  function moveDraftItem(from: number, to: number) {
    setPackDraft((draft) => {
      if (!draft || from === to) return draft;
      const items = [...draft.items];
      const [item] = items.splice(from, 1);
      items.splice(to, 0, item);
      return { ...draft, items };
    });
  }

  function download() {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${levelId.trim() || "level"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("JSON скачан");
    window.setTimeout(() => setNotice(""), 2200);
  }

  async function downloadAllSavedLevels() {
    if (savedLevels.length === 0) return;
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const usedNames = new Set<string>();

      savedLevels.forEach((saved) => {
        const baseName = safeFileName(saved.id);
        let fileName = `${baseName}.json`;
        let suffix = 2;
        while (usedNames.has(fileName.toLocaleLowerCase())) fileName = `${baseName}-${suffix++}.json`;
        usedNames.add(fileName.toLocaleLowerCase());
        zip.file(fileName, JSON.stringify(createLevelConfig(saved.snapshot), null, 2));
      });

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "hexa-sort-levels.zip";
      link.click();
      URL.revokeObjectURL(url);
      setNotice(`Скачан архив: ${savedLevels.length} уровней`);
      window.setTimeout(() => setNotice(""), 2200);
    } catch {
      setNotice("Не удалось создать архив");
    }
  }

  function saveLevel() {
    const id = levelId.trim();
    if (!id) {
      setNotice("Укажите ID уровня");
      return;
    }
    const savedTitle = title.trim() || id;
    const levelWithSameTitle = savedLevels.find(
      (level) => level.title.trim().toLocaleLowerCase() === savedTitle.toLocaleLowerCase(),
    );
    if (levelWithSameTitle && !window.confirm(`Уровень с названием «${savedTitle}» уже существует. Обновить его?`)) {
      setNotice("Сохранение отменено");
      window.setTimeout(() => setNotice(""), 2200);
      return;
    }
    const snapshot: LevelSnapshot = {
      levelId: id, title, targetScore, targetType, targetColor, columnCount, rowCount,
      active: [...active], placements, emptyCellLocks, colors, packs, selectedPack, queue, randomPacks,
    };
    const saved: SavedLevel = { id, title: savedTitle, updatedAt: new Date().toISOString(), snapshot };
    const next = [...savedLevels.filter((level) => level.id !== id && level.id !== levelWithSameTitle?.id), saved]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    try {
      window.localStorage.setItem(SAVED_LEVELS_KEY, JSON.stringify(next));
      setSavedLevels(next);
      setSelectedSavedLevel(id);
      setNotice(savedLevels.some((level) => level.id === id) || levelWithSameTitle ? "Уровень обновлён" : "Уровень сохранён");
      window.setTimeout(() => setNotice(""), 2200);
    } catch {
      setNotice("Не удалось сохранить уровень");
    }
  }

  function loadLevel(id: string) {
    setSelectedSavedLevel(id);
    const saved = savedLevels.find((level) => level.id === id);
    if (!saved) return;
    const value = saved.snapshot;
    setLevelId(value.levelId);
    setTitle(value.title);
    setTargetScore(value.targetScore);
    setTargetType(value.targetType);
    setTargetColor(value.targetColor);
    setColumnCount(value.columnCount);
    setRowCount(value.rowCount);
    setActive(new Set(value.active));
    setPlacements(value.placements);
    setEmptyCellLocks(value.emptyCellLocks ?? {});
    setColors(value.colors);
    setPacks(value.packs);
    setSelectedPack(value.selectedPack);
    setQueue(value.queue);
    setRandomPacks(value.randomPacks);
    setContextMenu(null);
    setNotice(`Загружен уровень «${saved.title}»`);
    window.setTimeout(() => setNotice(""), 2200);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">H</span><div><strong>Hexa Sort</strong><small>Конструктор уровней</small></div></div>
        <div className="top-actions">
          <button className="download-all" disabled={savedLevels.length === 0} onClick={downloadAllSavedLevels}>Скачать ZIP</button>
          <select className="saved-level-select" aria-label="Сохранённые уровни" value={selectedSavedLevel} onChange={(event) => loadLevel(event.target.value)}>
            <option value="">Сохранённые уровни ({savedLevels.length})</option>
            {savedLevels.map((level) => <option key={level.id} value={level.id}>{level.title} · {level.id}</option>)}
          </select>
          <button className="save-level" onClick={saveLevel}>Сохранить уровень</button>
          <button className="secondary" onClick={() => navigator.clipboard.writeText(JSON.stringify(config, null, 2)).then(() => setNotice("JSON скопирован"))}>Копировать JSON</button>
          <button className="primary" onClick={download}>Скачать JSON</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="left-panel panel">
          <p className="eyebrow">Настройки уровня</p>
          <label>ID уровня<input value={levelId} onChange={(event) => setLevelId(event.target.value)} /></label>
          <label>Название<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <div className="section-rule" />
          <h2>Цель</h2>
          <div className="segmented"><button className={targetType === "any" ? "active" : ""} onClick={() => setTargetType("any")}>Любой цвет</button><button className={targetType === "color" ? "active" : ""} onClick={() => setTargetType("color")}>Конкретный</button></div>
          {targetType === "color" && <label>Цвет<select value={targetColor} onChange={(event) => setTargetColor(event.target.value)}>{colors.map((color) => <option key={color.id} value={color.id}>{color.name}</option>)}</select></label>}
          <label>Количество<input type="number" min="1" value={targetScore} onChange={(event) => setTargetScore(Math.max(1, Number(event.target.value)))} /></label>
          <div className="section-rule" />
          <h2>Настройки поля</h2>
          <div className="board-size-fields">
            <label>Столбцы<div className="number-stepper"><input type="number" min={MIN_BOARD_SIZE} max={MAX_COLUMN_COUNT} value={columnCount} onChange={(event) => resizeBoard(Number(event.target.value), rowCount)} /><span><button type="button" aria-label="Увеличить количество столбцов" disabled={columnCount >= MAX_COLUMN_COUNT} onClick={() => resizeBoard(columnCount + 1, rowCount)}>▲</button><button type="button" aria-label="Уменьшить количество столбцов" disabled={columnCount <= MIN_BOARD_SIZE} onClick={() => resizeBoard(columnCount - 1, rowCount)}>▼</button></span></div></label>
            <label>Строки<div className="number-stepper"><input type="number" min={MIN_BOARD_SIZE} max={MAX_ROW_COUNT} value={rowCount} onChange={(event) => resizeBoard(columnCount, Number(event.target.value))} /><span><button type="button" aria-label="Увеличить количество строк" disabled={rowCount >= MAX_ROW_COUNT} onClick={() => resizeBoard(columnCount, rowCount + 1)}>▲</button><button type="button" aria-label="Уменьшить количество строк" disabled={rowCount <= MIN_BOARD_SIZE} onClick={() => resizeBoard(columnCount, rowCount - 1)}>▼</button></span></div></label>
          </div>
          <p className="hint board-size-hint">Диапазон: {MIN_BOARD_SIZE}–{MAX_COLUMN_COUNT} столбцов и {MIN_BOARD_SIZE}–{MAX_ROW_COUNT} строк.</p>
          <p className="hint">Клик включает пустую ячейку или удаляет активную вместе с установленной пачкой. Чтобы установить пачку, перетащите её из библиотеки на активную ячейку.</p>
          <div className="legend"><span><i className="empty" /> Неактивный</span><span><i className="active-cell" /> Активный</span></div>
        </aside>

        <section className="canvas-panel">
          <div className="canvas-head"><div><p className="eyebrow">Игровое поле</p><h1>Сетка {columnCount} × {rowCount}</h1></div><button className="test-button" onClick={() => setTestLevel(config)}>▶ Тестировать</button><div className="stats"><span><b>{active.size}</b> слотов</span><span><b>{Object.keys(placements).length}</b> пачек</span></div></div>
          <div className="board-target"><div className="board-target-content"><strong>Цель:</strong><i className={`board-target-icon ${targetType === "any" ? "any" : ""}`} style={targetType === "color" ? { background: colors.find((color) => color.id === targetColor)?.hex ?? "#bbb" } : undefined} /><span>{targetType === "any" ? "Любой цвет" : colors.find((color) => color.id === targetColor)?.name ?? targetColor}</span><b>× {targetScore}</b></div></div>
          <div className="board-wrap">
            <div className="board-stage">
              <div className="hex-board coordinate-grid" style={{ position: "relative", display: "block", width: columnCount * 130 + 72, height: rowCount * 36 + 48, padding: 0 }}>
                {Array.from({ length: rowCount }, (_, row) => Array.from({ length: slotsInRow(row, columnCount) }, (_, slot) => {
                  const id = cellId(row, slot); const isActive = active.has(id); const placement = placements[id]; const emptyLock = emptyCellLocks[id]; const cellLock = placement?.locked ? { unlockHexCount: placement.unlockHexCount ?? 10 } : emptyLock; const pack = placement && packs.find((item) => item.id === placement.packId);
                  const column = cellColumn(row, slot, columnCount);
                  return <div className={`hex-cell-position ${placement ? "has-placement" : ""}`} key={id} style={{ position: "absolute", left: `calc(50% + ${column * 65}px)`, top: row * 36, width: 84, height: 72, transform: "translateX(-50%)" }}>
                    <button style={{ width: 84, height: 72 }} className={`hex-cell ${isActive ? "is-active" : ""} ${placement ? "has-pack" : ""} ${draggingPackId && isActive && !emptyLock ? "can-drop" : ""} ${dragTargetCell === id ? "is-drop-target" : ""} ${emptyLock ? "is-locked-empty" : ""}`} onClick={() => handleBoardClick(id)} onDragEnter={(event) => { if (!isActive || emptyLock || !draggingPackId) return; event.preventDefault(); setDragTargetCell(id); }} onDragOver={(event) => { if (!isActive || emptyLock || !draggingPackId) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragTargetCell((current) => current === id ? null : current); }} onDrop={(event) => { event.preventDefault(); const packId = event.dataTransfer.getData("application/x-hexa-pack") || draggingPackId; if (packId) dropPack(id, packId); }} onContextMenu={(event) => { event.preventDefault(); if (isActive) setContextMenu({ cellId: id, x: event.clientX, y: event.clientY }); }} title={`${id} · column ${column}${pack ? ` — ${pack.name}. Правый клик — действия` : emptyLock ? " — ячейка заблокирована" : ""}`}>
                      {pack && <PieceStack items={pack.items} colors={colors} />}
                      {!isActive && <span className="plus">+</span>}
                    </button>
                    {isActive && <div className="cell-lock-control" onContextMenu={(event) => { event.preventDefault(); setContextMenu({ cellId: id, x: event.clientX, y: event.clientY }); }}><span className={`lock ${cellLock ? "locked" : ""}`} onClick={(event) => { event.stopPropagation(); toggleLock(id); }} title={cellLock ? `Замок включён. Нужно собрать рядом ${cellLock.unlockHexCount} гексов. Правый клик — изменить количество.` : "Замок выключен. Нажмите, чтобы включить."}>🔒</span>{cellLock && <span className="lock-count">{cellLock.unlockHexCount}</span>}</div>}
                  </div>;
                }))}
              </div>
              <section className="hand-preview" aria-label="Начальная очередь">
                <p>Начальная очередь</p>
                <div>{initialHand.map((item, index) => {
                  const pack = item?.kind === "pack" ? packs.find((entry) => entry.id === item.packId) : null;
                  return <article className={`hand-slot ${item ? "is-filled" : ""}`} key={index} title={pack?.name ?? (item?.kind === "random" ? "Случайная пачка" : "Пустой слот")}><span>{index + 1}</span>{pack ? <PieceStack items={pack.items} colors={colors} /> : item?.kind === "random" ? <b className="random-stack">?</b> : <i>+</i>}</article>;
                })}</div>
              </section>
            </div>
          </div>
          <div className="canvas-tip">Нажмите кнопку 🔒 на пачке или используйте правый клик</div>
        </section>

        <aside className="right-panel panel">
          <div className="tabs"><span className="active">Пачки</span><span>Очередь</span></div>
          <div className="scroll-content">
            <div className="section-title"><div><h2>Библиотека пачек</h2><p>Перетащите пачку на активную ячейку поля</p></div><button className="icon-button" onClick={() => setPackDraft({ name: `Новая пачка ${packs.length + 1}`, items: [] })} title="Создать пачку">+</button></div>
            <div className="pack-list">{packs.map((pack) => <article className={`pack-card ${selectedPack === pack.id ? "selected" : ""} ${draggingPackId === pack.id ? "is-dragging" : ""}`} key={pack.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-hexa-pack", pack.id); setDraggingPackId(pack.id); setSelectedPack(pack.id); }} onDragEnd={() => { setDraggingPackId(null); setDragTargetCell(null); }} onClick={() => setSelectedPack(pack.id)} title="Перетащите пачку на активную ячейку поля">
              <PieceStack items={pack.items} colors={colors} small />
              <div><strong>{pack.name}</strong><small>{pack.id} · {pack.items.length} шт.</small></div>
              <button className="pack-edit" draggable={false} onClick={(event) => { event.stopPropagation(); setPackDraft({ id: pack.id, name: pack.name, items: [...pack.items] }); }} title={`Редактировать ${pack.name}`} aria-label={`Редактировать ${pack.name}`}>✎</button>
            </article>)}</div>

            <div className="section-rule" />
            <div className="section-title"><div><h2>Жёсткая очередь</h2><p>Первые 3 пачки под полем, остальные идут следом (до 9)</p></div><b>{queue.length}/9</b></div>
            <div className="queue-grid">{queue.map((item, index) => <div className="queue-item" key={index}><span>{index + 1}</span><select value={item.kind === "random" ? "random" : item.packId} onChange={(event) => setQueue((value) => value.map((entry, i) => i === index ? event.target.value === "random" ? { kind: "random" } : { kind: "pack", packId: event.target.value } : entry))}><option value="random">Random по весам</option>{packs.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select><button onClick={() => setQueue((value) => value.filter((_, i) => i !== index))}>×</button></div>)}</div>
            <button className="wide-button" disabled={queue.length >= 9} onClick={() => setQueue((value) => [...value, { kind: "pack", packId: selectedPack }])}>+ Добавить в очередь</button>

            <div className="section-rule" />
            <div className="section-title"><div><h2>Случайная выдача</h2><p>После жёсткой очереди и для Random</p></div></div>
            <div className="random-list">
              {randomPacks.length === 0 && <div className="random-empty">Добавьте хотя бы одну пачку с весом больше 0</div>}
              {randomPacks.map((entry, index) => {
                const pack = packs.find((item) => item.id === entry.packId);
                const share = randomWeightTotal > 0 && entry.weight > 0 ? Math.round((entry.weight / randomWeightTotal) * 100) : 0;
                return (
                  <article className={`random-card ${entry.weight <= 0 ? "is-muted" : ""}`} key={`${entry.packId}-${index}`}>
                    <span className="random-number">{index + 1}</span>
                    <select className="random-pack-select" value={entry.packId} onChange={(event) => updateRandomPack(index, { packId: event.target.value })} aria-label="Пачка для случайной выдачи">
                      {packs.map((packItem) => <option key={packItem.id} value={packItem.id} disabled={randomPacks.some((item, itemIndex) => itemIndex !== index && item.packId === packItem.id)}>{packItem.name}</option>)}
                    </select>
                    <div className="random-weight">
                      <span title="Вес">Вес</span>
                      <input type="number" min="0" value={entry.weight} onChange={(event) => updateRandomPack(index, { weight: Math.max(0, Number(event.target.value)) })} aria-label={`Вес ${pack?.name ?? "пачки"}`} />
                    </div>
                    <strong className="random-share">{share > 0 ? `${share}%` : "0%"}</strong>
                    <button className="random-remove" onClick={() => setRandomPacks((value) => value.filter((_, itemIndex) => itemIndex !== index))} title="Убрать из случайной выдачи" aria-label={`Убрать ${pack?.name ?? "пачку"} из случайной выдачи`}>×</button>
                  </article>
                );
              })}
            </div>
            <p className="random-note">Чем больше вес, тем чаще пачка выпадает. Например, вес 20 выпадает примерно в 2 раза чаще веса 10.</p>
            <button className="wide-button" disabled={packs.every((pack) => randomPacks.some((entry) => entry.packId === pack.id))} onClick={addRandomPack}>+ Добавить пачку</button>

            <div className="section-rule" />
            <div className="section-title"><div><h2>Палитра</h2><p>ID и визуал цветов</p></div><button className="icon-button" onClick={openColorEditor} title="Добавить цвет" aria-label="Добавить цвет">+</button></div>
            <div className="color-list">{colors.map((color) => <div className="color-row" key={color.id} onDoubleClick={() => editColor(color)}><i className="color-row-swatch" style={{ background: color.hex }} /><div className="color-info"><strong>{color.name}</strong><span title={`ID: ${color.id}`}>ID: {color.id}</span></div><div className="color-actions"><button type="button" className="color-edit" onClick={() => editColor(color)} title={`Редактировать ${color.name}`} aria-label={`Редактировать ${color.name}`}><span>✎</span>Изменить</button><button type="button" className="color-remove" disabled={colors.length <= 1} onClick={(event) => { event.stopPropagation(); deleteColor(color.id); }} title={`Удалить ${color.name}`} aria-label={`Удалить ${color.name}`}>×</button></div></div>)}</div>
          </div>
        </aside>
      </section>
      {packDraft && <div className="modal-backdrop" onPointerDown={() => setPackDraft(null)}><section className="pack-modal" onPointerDown={(event) => event.stopPropagation()}>
        <header><div><p className="eyebrow">Библиотека пачек</p><h2>{packDraft.id ? "Редактирование пачки" : "Новая пачка"}</h2></div><button onClick={() => setPackDraft(null)} aria-label="Закрыть">×</button></header>
        <label className="draft-name">Название пачки<input autoFocus value={packDraft.name} onChange={(event) => setPackDraft({ ...packDraft, name: event.target.value })} /></label>
        <div className="pack-editor">
          <div className="draft-palette"><h3>Цвета</h3><p>Перетащите цвет в стопку или нажмите на него</p>{colors.map((color) => <button key={color.id} draggable onDragStart={(event) => event.dataTransfer.setData("colorId", String(color.id))} onClick={() => setPackDraft({ ...packDraft, items: [...packDraft.items, color.id] })}><i style={{ background: color.hex }} /><span>{color.name}</span><b>+</b></button>)}</div>
          <div className="draft-stack-zone"><div><h3>Состав пачки</h3><p>Порядок: низ → верх</p></div><div className={`draft-stack ${packDraft.items.length === 0 ? "empty" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const colorId = event.dataTransfer.getData("colorId"); const from = Number(event.dataTransfer.getData("stackIndex")); if (colorId) setPackDraft({ ...packDraft, items: [...packDraft.items, colorId] }); else if (Number.isInteger(from)) moveDraftItem(from, packDraft.items.length - 1); }}>
            {packDraft.items.length === 0 && <div className="drop-prompt"><span>＋</span><b>Перетащите цвет сюда</b><small>Первый цвет станет нижним</small></div>}
            {packDraft.items.map((colorId, index) => { const color = colors.find((item) => item.id === colorId); return <div className="draft-piece" key={`${colorId}-${index}`} draggable onDragStart={(event) => event.dataTransfer.setData("stackIndex", String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const from = Number(event.dataTransfer.getData("stackIndex")); if (Number.isInteger(from)) moveDraftItem(from, index); }}><span>{index === 0 ? "НИЗ" : index === packDraft.items.length - 1 ? "ВЕРХ" : index + 1}</span><i style={{ background: color?.hex }} /><b>{color?.name}</b><div><button disabled={index === 0} onClick={() => moveDraftItem(index, index - 1)}>↓</button><button disabled={index === packDraft.items.length - 1} onClick={() => moveDraftItem(index, index + 1)}>↑</button><button className="remove" onClick={() => setPackDraft({ ...packDraft, items: packDraft.items.filter((_, itemIndex) => itemIndex !== index) })}>×</button></div></div>; })}
          </div></div>
        </div>
        <footer><span>{packDraft.items.length} элементов</span><div><button className="modal-cancel" onClick={() => setPackDraft(null)}>Отмена</button><button className="primary" disabled={packDraft.items.length === 0} onClick={savePack}>{packDraft.id ? "Сохранить" : "Создать пачку"}</button></div></footer>
      </section></div>}
      {contextMenu && (() => { const placement = placements[contextMenu.cellId]; const emptyLock = emptyCellLocks[contextMenu.cellId]; const locked = placement?.locked || Boolean(emptyLock); const unlockHexCount = placement?.unlockHexCount ?? emptyLock?.unlockHexCount ?? 10; return <div className="context-backdrop" onPointerDown={() => setContextMenu(null)} onContextMenu={(event) => { event.preventDefault(); setContextMenu(null); }}><div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}><small>{placement ? "Действия с пачкой" : "Действия с ячейкой"}</small><button onClick={() => toggleLock(contextMenu.cellId)}><span>{locked ? "🔓" : "🔒"}</span>{locked ? "Снять замок" : "Установить замок"}</button>{locked && <label className="lock-count-field"><span>Гексов для снятия</span><input key={`${contextMenu.cellId}-${unlockHexCount}`} type="number" min="1" defaultValue={unlockHexCount} onBlur={(event) => updateUnlockHexCount(contextMenu.cellId, Number(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>}{placement && <button className="danger" onClick={() => { setPlacements((value) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== contextMenu.cellId))); setContextMenu(null); }}><span>×</span>Убрать пачку</button>}</div></div>; })()}
      {colorDraft && <div className="modal-backdrop" onPointerDown={() => setColorDraft(null)}><section className="pack-modal color-modal" onPointerDown={(event) => event.stopPropagation()}>
        <header><div><p className="eyebrow">Палитра</p><h2>{colorDraft.originalId ? "Редактирование цвета" : "Новый цвет"}</h2></div><button onClick={() => setColorDraft(null)} aria-label="Закрыть">×</button></header>
        <div className="color-editor">
          <label>ID<input autoFocus value={colorDraft.id} onChange={(event) => setColorDraft({ ...colorDraft, id: event.target.value })} placeholder="Например, purple или color_special" /></label>
          {colors.some((color) => color.id === colorDraft.id.trim() && color.id !== colorDraft.originalId) && <p className="form-error">Цвет с ID {colorDraft.id.trim()} уже существует.</p>}
          <label>Название<input value={colorDraft.name} onChange={(event) => setColorDraft({ ...colorDraft, name: event.target.value })} placeholder="Например, Фиолетовый" /></label>
          <label>Цвет<div className="color-picker-field"><input type="color" value={colorDraft.hex} onChange={(event) => setColorDraft({ ...colorDraft, hex: event.target.value })} /><code>{colorDraft.hex.toUpperCase()}</code></div></label>
        </div>
        <footer><span title={colorDraft.id.trim()}>ID: {colorDraft.id.trim() || "—"}</span><div>{colorDraft.originalId && <button className="color-delete" disabled={colors.length <= 1} onClick={() => deleteColor()}>Удалить цвет</button>}<button className="modal-cancel" onClick={() => setColorDraft(null)}>Отмена</button><button className="primary" disabled={!colorDraft.id.trim() || !colorDraft.name.trim() || colors.some((color) => color.id === colorDraft.id.trim() && color.id !== colorDraft.originalId)} onClick={saveColor}>{colorDraft.originalId ? "Сохранить" : "Добавить цвет"}</button></div></footer>
      </section></div>}
      {testLevel && <GamePreview level={testLevel} onClose={() => setTestLevel(null)} />}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
