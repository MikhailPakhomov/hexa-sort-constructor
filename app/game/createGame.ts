import Phaser from "phaser";
import { HEXA_SORT_GAMEPLAY_ASSETS } from "./assets";
import { HEXA_SORT_GAME_SIZE } from "./gameConfig";
import { HexaSortScene } from "./HexaSortScene";
import type { GameResult, HexaSortLevelConfig } from "./types";

class PreloaderScene extends Phaser.Scene {
  constructor() { super("PreloaderScene"); }

  preload() {
    const { width, height } = HEXA_SORT_GAME_SIZE;
    this.add.rectangle(width / 2, height / 2, width, height, 0x090b12);
    const label = this.add.text(width / 2, height / 2, "Загрузка 0%", {
      color: "#ffffff", fontFamily: "Arial", fontSize: "18px", fontStyle: "bold",
    }).setOrigin(0.5);
    this.load.on("progress", (value: number) => label.setText(`Загрузка ${Math.round(value * 100)}%`));
    HEXA_SORT_GAMEPLAY_ASSETS.forEach(({ key, url }) => this.load.image(key, url));
  }

  create() { this.scene.start("HexaSortScene"); }
}

export function createHexaSortGame(parent: HTMLElement, level: HexaSortLevelConfig, onResult: (result: GameResult) => void) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: HEXA_SORT_GAME_SIZE.width,
    height: HEXA_SORT_GAME_SIZE.height,
    backgroundColor: "#080a0c",
    scene: [new PreloaderScene(), new HexaSortScene(level, onResult)],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, transparent: false },
  });
}
