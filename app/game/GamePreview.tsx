"use client";

import { useEffect, useRef, useState } from "react";
import type Phaser from "phaser";
import type { GameResult, HexaSortLevelConfig } from "./types";

export default function GamePreview({ level, onClose }: { level: HexaSortLevelConfig; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current) return;
    setResult(null);

    import("./createGame").then(({ createHexaSortGame }) => {
      if (cancelled || !containerRef.current) return;
      gameRef.current = createHexaSortGame(containerRef.current, level, setResult);
    });

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [level, run]);

  return <div className="game-preview-backdrop">
    <section className="game-preview-modal">
      <header><div><p className="eyebrow">Тест уровня</p><h2>{level.title}</h2></div><div><button onClick={() => setRun((value) => value + 1)}>↻ Перезапустить</button><button className="game-close" onClick={onClose}>×</button></div></header>
      <div className="game-stage"><div ref={containerRef} className="phaser-container" />
        {result && <div className={`game-result ${result}`}><span>{result === "victory" ? "★" : "×"}</span><h3>{result === "victory" ? "Победа!" : "Поражение"}</h3><p>{result === "victory" ? "Цель уровня выполнена" : "На поле не осталось свободных ячеек"}</p><div><button onClick={() => setRun((value) => value + 1)}>Играть ещё раз</button><button onClick={onClose}>Вернуться в редактор</button></div></div>}
      </div>
      <footer><span>Перетаскивайте стопки из очереди на свободные ячейки</span><button onClick={onClose}>Закрыть тест</button></footer>
    </section>
  </div>;
}
