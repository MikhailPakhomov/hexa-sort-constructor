"use client";

import { useMemo, useState } from "react";

type Color = { id: number; name: string; hex: string; sprite: string };
type Pack = { id: string; name: string; items: number[] };
type Placement = { packId: string; locked: boolean };
type QueueItem = { kind: "pack"; packId: string } | { kind: "random" };

const INITIAL_COLORS: Color[] = [
  { id: 1, name: "Розовый", hex: "#ff3fa3", sprite: "hex-pink" },
  { id: 2, name: "Голубой", hex: "#08afe3", sprite: "hex-cyan" },
  { id: 3, name: "Зелёный", hex: "#82ed00", sprite: "hex-green" },
  { id: 4, name: "Жёлтый", hex: "#ffd400", sprite: "hex-yellow" },
  { id: 5, name: "Синий", hex: "#1760f2", sprite: "hex-blue" },
  { id: 6, name: "Красный", hex: "#f5143e", sprite: "hex-red" },
  { id: 7, name: "Тёмно-синий", hex: "#172140", sprite: "hex-dark-blue" },
  { id: 8, name: "Белый", hex: "#d9ebff", sprite: "hex-white" },
];

const INITIAL_PACKS: Pack[] = [
  { id: "pack-yellow-3", name: "3 жёлтых", items: [4, 4, 4] },
  { id: "pack-red-3", name: "3 красных", items: [6, 6, 6] },
  { id: "pack-mix-3", name: "Микс", items: [1, 2, 3] },
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

const BOARD_ROW_COUNT = 9;

function cellId(row: number, slot: number) {
  return `${row}:${slot}`;
}

function cellColumn(row: number, slot: number) {
  return slot * 2 + (row % 2 === 0 ? -4 : -3);
}

function makeRows(active: Set<string>) {
  return Array.from({ length: BOARD_ROW_COUNT }, (_, row) => ({
    columns: Array.from({ length: 5 }, (_, slot) => cellId(row, slot))
      .filter((id) => active.has(id))
      .map((id) => cellColumn(row, Number(id.split(":")[1]))),
  }));
}

function PieceStack({ items, colors, small = false }: { items: number[]; colors: Color[]; small?: boolean }) {
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
  const [selectedPack, setSelectedPack] = useState(INITIAL_PACKS[0].id);
  const [boardTool, setBoardTool] = useState<"cells" | "packs">("cells");
  const [levelId, setLevelId] = useState("level-8");
  const [title, setTitle] = useState("Уровень 8");
  const [targetScore, setTargetScore] = useState(150);
  const [targetType, setTargetType] = useState<"any" | "color">("any");
  const [targetColor, setTargetColor] = useState(1);
  const [queue, setQueue] = useState<QueueItem[]>([
    { kind: "pack", packId: "pack-yellow-3" },
    { kind: "pack", packId: "pack-red-3" },
    { kind: "pack", packId: "pack-mix-3" },
  ]);
  const [weights, setWeights] = useState<Record<string, number>>({ "pack-yellow-3": 10, "pack-red-3": 10, "pack-mix-3": 10 });
  const [notice, setNotice] = useState("");
  const [contextMenu, setContextMenu] = useState<{ cellId: string; x: number; y: number } | null>(null);
  const [packDraft, setPackDraft] = useState<{ name: string; items: number[] } | null>(null);

  const rows = useMemo(() => makeRows(active), [active]);
  const config = useMemo(() => {
    const boardCells = rows.flatMap(({ columns }, row) => columns.map((column, slot) => ({ id: `${row}:${slot}`, row, slot, column })));
    const exportedCellIds = new Map<string, string>();
    Array.from({ length: BOARD_ROW_COUNT }, (_, row) => {
      const activeSlots = Array.from({ length: 5 }, (_, slot) => slot).filter((slot) => active.has(cellId(row, slot)));
      activeSlots.forEach((gridSlot, exportSlot) => exportedCellIds.set(cellId(row, gridSlot), `${row}:${exportSlot}`));
    });
    const hardPacks = queue.map((item, index) => item.kind === "random"
      ? { id: `queue-random-${index + 1}`, type: "random" }
      : { id: `queue-stack-${index + 1}`, packId: item.packId, items: packs.find((pack) => pack.id === item.packId)?.items ?? [] });
    const firstThree = hardPacks.slice(0, 3).map((stack, index) => ({ ...stack, id: `hand-stack-${index + 1}` }));
    return {
      id: levelId,
      title,
      targetScore,
      target: { type: targetType, ...(targetType === "color" ? { colorId: targetColor } : {}) },
      board: {
        rows,
        cells: boardCells,
      },
      initialStacks: Object.entries(placements)
        .filter(([id]) => active.has(id))
        .map(([id, placement], index) => ({ id: `board-stack-${index + 1}`, cellId: exportedCellIds.get(id) ?? id, packId: placement.packId, items: packs.find((pack) => pack.id === placement.packId)?.items ?? [], ...(placement.locked ? { blocker: "lock" } : {}) })),
      handStacks: firstThree,
      stackQueue: hardPacks.slice(3),
      randomQueue: { packs: packs.filter((pack) => (weights[pack.id] ?? 0) > 0).map((pack) => ({ packId: pack.id, weight: weights[pack.id] })) },
      library: { colors, packs },
    };
  }, [active, colors, levelId, packs, placements, queue, rows, targetColor, targetScore, targetType, title, weights]);

  function toggleCell(id: string) {
    setActive((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        setPlacements((value) => { const copy = { ...value }; delete copy[id]; return copy; });
      } else next.add(id);
      return next;
    });
  }

  function placePack(id: string) {
    if (!active.has(id)) return;
    setPlacements((current) => current[id] ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)) : { ...current, [id]: { packId: selectedPack, locked: false } });
  }

  function handleBoardClick(id: string) {
    setContextMenu(null);
    if (boardTool === "cells") toggleCell(id);
    else placePack(id);
  }

  function toggleLock(id: string) {
    const placement = placements[id];
    if (!placement) return;
    setPlacements((value) => ({ ...value, [id]: { ...placement, locked: !placement.locked } }));
    setContextMenu(null);
  }

  function savePack() {
    if (!packDraft || packDraft.items.length === 0) return;
    let sequence = packs.length + 1;
    while (packs.some((pack) => pack.id === `pack-${sequence}`)) sequence += 1;
    const id = `pack-${sequence}`;
    setPacks((value) => [...value, { id, name: packDraft.name.trim() || `Новая пачка ${sequence}`, items: packDraft.items }]);
    setWeights((value) => ({ ...value, [id]: 10 }));
    setSelectedPack(id);
    setPackDraft(null);
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

  function updatePack(id: string, patch: Partial<Pack>) {
    setPacks((value) => value.map((pack) => pack.id === id ? { ...pack, ...patch } : pack));
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">H</span><div><strong>Hexa Sort</strong><small>Конструктор уровней</small></div></div>
        <div className="top-actions"><span className="saved-dot">Все изменения сохранены</span><button className="secondary" onClick={() => navigator.clipboard.writeText(JSON.stringify(config, null, 2)).then(() => setNotice("JSON скопирован"))}>Копировать JSON</button><button className="primary" onClick={download}>Скачать JSON</button></div>
      </header>

      <section className="workspace">
        <aside className="left-panel panel">
          <p className="eyebrow">Настройки уровня</p>
          <label>ID уровня<input value={levelId} onChange={(event) => setLevelId(event.target.value)} /></label>
          <label>Название<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <div className="section-rule" />
          <h2>Цель</h2>
          <div className="segmented"><button className={targetType === "any" ? "active" : ""} onClick={() => setTargetType("any")}>Любой цвет</button><button className={targetType === "color" ? "active" : ""} onClick={() => setTargetType("color")}>Конкретный</button></div>
          {targetType === "color" && <label>Цвет<select value={targetColor} onChange={(event) => setTargetColor(Number(event.target.value))}>{colors.map((color) => <option key={color.id} value={color.id}>{color.name}</option>)}</select></label>}
          <label>Количество<input type="number" min="1" value={targetScore} onChange={(event) => setTargetScore(Math.max(1, Number(event.target.value)))} /></label>
          <div className="goal-preview"><span>Прогресс</span><strong>0 / {targetScore}</strong><i><b style={{ width: "12%" }} /></i></div>
          <div className="section-rule" />
          <h2>Настройки поля</h2>
          <div className="segmented tool-switch"><button className={boardTool === "cells" ? "active" : ""} onClick={() => setBoardTool("cells")}>Ячейки</button><button className={boardTool === "packs" ? "active" : ""} onClick={() => setBoardTool("packs")}>Пачки</button></div>
          <p className="hint">{boardTool === "cells" ? "Клик включает пустую ячейку или удаляет активную вместе с установленной пачкой." : "Клик по активной ячейке ставит выбранную пачку или убирает установленную."}</p>
          {boardTool === "packs" && <label>Выбранная пачка<select value={selectedPack} onChange={(event) => setSelectedPack(event.target.value)}>{packs.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select></label>}
          <div className="legend"><span><i className="empty" /> Неактивный</span><span><i className="active-cell" /> Активный</span></div>
        </aside>

        <section className="canvas-panel">
          <div className="canvas-head"><div><p className="eyebrow">Игровое поле</p><h1>Сетка 5 × 9</h1></div><div className="stats"><span><b>{active.size}</b> слотов</span><span><b>{Object.keys(placements).length}</b> пачек</span></div></div>
          <div className="board-wrap">
            <div className="hex-board coordinate-grid" style={{ position: "relative", display: "block", width: 600, height: 300, padding: 0 }}>
              {Array.from({ length: BOARD_ROW_COUNT }, (_, row) => Array.from({ length: 5 }, (_, slot) => {
                const id = cellId(row, slot); const isActive = active.has(id); const placement = placements[id]; const pack = placement && packs.find((item) => item.id === placement.packId);
                const column = cellColumn(row, slot);
                return <button key={id} style={{ position: "absolute", left: `calc(50% + ${column * 54}px)`, top: row * 30, width: 70, height: 60, transform: "translateX(-50%)" }} className={`hex-cell ${isActive ? "is-active" : ""} ${placement ? "has-pack" : ""} tool-${boardTool}`} onClick={() => handleBoardClick(id)} onContextMenu={(event) => { event.preventDefault(); if (placement) setContextMenu({ cellId: id, x: event.clientX, y: event.clientY }); }} title={`${id} · column ${column}${pack ? ` — ${pack.name}. Правый клик — действия` : ""}`}>
                  {pack && <PieceStack items={pack.items} colors={colors} />}{placement && <span className={`lock ${placement.locked ? "locked" : ""}`} onClick={(event) => { event.stopPropagation(); toggleLock(id); }} title={placement.locked ? "Снять замок" : "Установить замок"}>🔒</span>}
                  {!isActive && <span className="plus">+</span>}
                </button>;
              }))}
            </div>
          </div>
          <div className="canvas-tip">Нажмите кнопку 🔒 на пачке или используйте правый клик</div>
        </section>

        <aside className="right-panel panel">
          <div className="tabs"><span className="active">Пачки</span><span>Очередь</span></div>
          <div className="scroll-content">
            <div className="section-title"><div><h2>Библиотека пачек</h2><p>Общие стопки уровня</p></div><button className="icon-button" onClick={() => setPackDraft({ name: `Новая пачка ${packs.length + 1}`, items: [] })} title="Создать пачку">+</button></div>
            <div className="pack-list">{packs.map((pack) => <article className={`pack-card ${selectedPack === pack.id ? "selected" : ""}`} key={pack.id} onClick={() => setSelectedPack(pack.id)}>
              <PieceStack items={pack.items} colors={colors} small />
              <div><input value={pack.name} onClick={(e) => e.stopPropagation()} onChange={(event) => updatePack(pack.id, { name: event.target.value })} /><small>{pack.id} · {pack.items.length} шт.</small></div>
              <button onClick={(event) => { event.stopPropagation(); updatePack(pack.id, { items: [...pack.items, colors[pack.items.length % colors.length].id] }); }}>+</button>
              <button disabled={pack.items.length <= 1} onClick={(event) => { event.stopPropagation(); updatePack(pack.id, { items: pack.items.slice(0, -1) }); }}>−</button>
            </article>)}</div>

            <div className="section-rule" />
            <div className="section-title"><div><h2>Жёсткая очередь</h2><p>До 9 пачек, первые 3 — рука</p></div><b>{queue.length}/9</b></div>
            <div className="queue-grid">{queue.map((item, index) => <div className="queue-item" key={index}><span>{index + 1}</span><select value={item.kind === "random" ? "random" : item.packId} onChange={(event) => setQueue((value) => value.map((entry, i) => i === index ? event.target.value === "random" ? { kind: "random" } : { kind: "pack", packId: event.target.value } : entry))}><option value="random">Random</option>{packs.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select><button onClick={() => setQueue((value) => value.filter((_, i) => i !== index))}>×</button></div>)}</div>
            <button className="wide-button" disabled={queue.length >= 9} onClick={() => setQueue((value) => [...value, { kind: "pack", packId: selectedPack }])}>+ Добавить в очередь</button>

            <div className="section-rule" />
            <div className="section-title"><div><h2>Случайная выдача</h2><p>После жёсткой очереди</p></div></div>
            <div className="weights">{packs.map((pack) => <label key={pack.id}><span>{pack.name}</span><input type="number" min="0" value={weights[pack.id] ?? 0} onChange={(event) => setWeights((value) => ({ ...value, [pack.id]: Math.max(0, Number(event.target.value)) }))} /><em>вес</em></label>)}</div>

            <div className="section-rule" />
            <div className="section-title"><div><h2>Палитра</h2><p>ID и визуал цветов</p></div></div>
            <div className="color-list">{colors.map((color) => <label key={color.id}><input type="color" value={color.hex} onChange={(event) => setColors((value) => value.map((item) => item.id === color.id ? { ...item, hex: event.target.value } : item))} /><input value={color.name} onChange={(event) => setColors((value) => value.map((item) => item.id === color.id ? { ...item, name: event.target.value } : item))} /><span>ID {color.id}</span></label>)}</div>
          </div>
        </aside>
      </section>
      {packDraft && <div className="modal-backdrop" onPointerDown={() => setPackDraft(null)}><section className="pack-modal" onPointerDown={(event) => event.stopPropagation()}>
        <header><div><p className="eyebrow">Библиотека пачек</p><h2>Новая пачка</h2></div><button onClick={() => setPackDraft(null)} aria-label="Закрыть">×</button></header>
        <label className="draft-name">Название пачки<input autoFocus value={packDraft.name} onChange={(event) => setPackDraft({ ...packDraft, name: event.target.value })} /></label>
        <div className="pack-editor">
          <div className="draft-palette"><h3>Цвета</h3><p>Перетащите цвет в стопку или нажмите на него</p>{colors.map((color) => <button key={color.id} draggable onDragStart={(event) => event.dataTransfer.setData("colorId", String(color.id))} onClick={() => setPackDraft({ ...packDraft, items: [...packDraft.items, color.id] })}><i style={{ background: color.hex }} /><span>{color.name}</span><b>+</b></button>)}</div>
          <div className="draft-stack-zone"><div><h3>Состав пачки</h3><p>Порядок: низ → верх</p></div><div className={`draft-stack ${packDraft.items.length === 0 ? "empty" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const colorId = Number(event.dataTransfer.getData("colorId")); const from = Number(event.dataTransfer.getData("stackIndex")); if (colorId) setPackDraft({ ...packDraft, items: [...packDraft.items, colorId] }); else if (Number.isInteger(from)) moveDraftItem(from, packDraft.items.length - 1); }}>
            {packDraft.items.length === 0 && <div className="drop-prompt"><span>＋</span><b>Перетащите цвет сюда</b><small>Первый цвет станет нижним</small></div>}
            {packDraft.items.map((colorId, index) => { const color = colors.find((item) => item.id === colorId); return <div className="draft-piece" key={`${colorId}-${index}`} draggable onDragStart={(event) => event.dataTransfer.setData("stackIndex", String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const from = Number(event.dataTransfer.getData("stackIndex")); if (Number.isInteger(from)) moveDraftItem(from, index); }}><span>{index === 0 ? "НИЗ" : index === packDraft.items.length - 1 ? "ВЕРХ" : index + 1}</span><i style={{ background: color?.hex }} /><b>{color?.name}</b><div><button disabled={index === 0} onClick={() => moveDraftItem(index, index - 1)}>↓</button><button disabled={index === packDraft.items.length - 1} onClick={() => moveDraftItem(index, index + 1)}>↑</button><button className="remove" onClick={() => setPackDraft({ ...packDraft, items: packDraft.items.filter((_, itemIndex) => itemIndex !== index) })}>×</button></div></div>; })}
          </div></div>
        </div>
        <footer><span>{packDraft.items.length} элементов</span><div><button className="modal-cancel" onClick={() => setPackDraft(null)}>Отмена</button><button className="primary" disabled={packDraft.items.length === 0} onClick={savePack}>Создать пачку</button></div></footer>
      </section></div>}
      {contextMenu && placements[contextMenu.cellId] && <div className="context-backdrop" onPointerDown={() => setContextMenu(null)} onContextMenu={(event) => { event.preventDefault(); setContextMenu(null); }}><div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}><small>Действия с пачкой</small><button onClick={() => toggleLock(contextMenu.cellId)}><span>{placements[contextMenu.cellId].locked ? "🔓" : "🔒"}</span>{placements[contextMenu.cellId].locked ? "Снять замок" : "Установить замок"}</button><button className="danger" onClick={() => { setPlacements((value) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== contextMenu.cellId))); setContextMenu(null); }}><span>×</span>Убрать пачку</button></div></div>}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
