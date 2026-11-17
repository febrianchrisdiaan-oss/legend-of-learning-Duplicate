// client/src/scenes/BootScene.ts
import Phaser from "phaser";
import { getPendingRoom } from "../core/gameBridge";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create(): void {
    console.log("[BootScene] Boot selesai, lanjut ke PreloadScene");
    const room = getPendingRoom();
    this.scene.start("PreloadScene", { room });
  }
}