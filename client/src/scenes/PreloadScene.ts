// client/src/scenes/PreloadScene.ts
import Phaser from "phaser";
import type { Room } from "colyseus.js";
const MAP_FILES: Record<string, string> = {
  easy: "/assets/maps/map-easy.tmj",
  medium: "/assets/maps/map_medium.tmj",
  hard: "/assets/maps/MapHARD.tmj",
};

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
  }

  init(data: { room: Room }): void {
    this.registry.set("room", data.room);
  }

  preload(): void {
    const room = this.registry.get("room");
    const raw = String(room?.state?.difficulty ?? "easy").toLowerCase();
    const diff = MAP_FILES[raw] ? raw : "easy";
    const mapKey = `map_${diff}`;
    const mapUrl = MAP_FILES[diff];

    this.load.tilemapTiledJSON(mapKey, mapUrl);
    this.load.once(`filecomplete-tilemapJSON-${mapKey}`, () => {
      const data = this.cache.tilemap.get(mapKey).data;
      data.tilesets.forEach((ts: any) => {
        const url = new URL(ts.image, new URL(mapUrl, window.location.origin)).pathname;
        this.load.image(`${mapKey}:${ts.name}`, url); // key unik per map: tidak bisa bentrok
      });
    });
 // =========================================================
    // Tileset Lama (Biarkan saja jika map lama masih butuh)
    this.load.image("tiles", "/assets/tileset/spr_tileset_sunnysideworld_16px.png");
    this.load.image("forest_tiles", "/assets/tileset/spr_tileset_sunnysideworld_forest_32px.png");
    this.load.image("coracle_tiles", "/assets/elements/spr_deco_coracle_strip4.png");
    this.load.image("windmill_tiles", "/assets/elements/spr_deco_windmill_withshadow_strip9.png");

    // === (KODE LOAD KARAKTER DAN MUSUH DI BAWAHNYA TETAP SAMA SEPERTI SEBELUMNYA) ===
    // ...
    // Karakter utama (Human)
    const humanPath = "/assets/characters/Human";
    this.load.spritesheet("character", `${humanPath}/WALKING/base_walk_strip8.png`, { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("base_idle", `${humanPath}/IDLE/base_idle_strip9.png`, { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("base_attack", `${humanPath}/ATTACK/base_attack_strip10.png`, { frameWidth: 96, frameHeight: 64 });
    this.load.image("expression_working", "/assets/elements/expression_working.png");
    this.load.spritesheet("base_run", `${humanPath}/RUN/base_run_strip8.png`, { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("base_roll", `${humanPath}/ROLL/base_roll_strip10.png`, { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("base_death", `${humanPath}/DEATH/base_death_strip13.png`, { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("base_hurt", `${humanPath}/HURT/base_hurt_strip8.png`, { frameWidth: 96, frameHeight: 64 });

    // Karakter utama (Human & Varian Rambut)
    const humanPath1 = "/assets/characters/Human";
    const hairTypes = ["base", "bowlhair", "curlyhair", "longhair", "mophair", "shorthair", "spikeyhair"];

    hairTypes.forEach((hair) => {
      const prefix = hair === "base" ? "base" : hair;
      
      // Load Walking, Run, Idle, Death, dll untuk setiap jenis rambut
      this.load.spritesheet(`${hair}_walk`, `${humanPath1}/WALKING/${prefix}_walk_strip8.png`, { frameWidth: 96, frameHeight: 64 });
      this.load.spritesheet(`${hair}_idle`, `${humanPath1}/IDLE/${prefix}_idle_strip9.png`, { frameWidth: 96, frameHeight: 64 });
      this.load.spritesheet(`${hair}_run`, `${humanPath1}/RUN/${prefix}_run_strip8.png`, { frameWidth: 96, frameHeight: 64 });
      this.load.spritesheet(`${hair}_death`, `${humanPath1}/DEATH/${prefix}_death_strip13.png`, { frameWidth: 96, frameHeight: 64 });
    });


    //sfx

    const currentTheme = localStorage.getItem("zigma_audio_theme") || "fantasy-rpg";

    // 2. Load audio dinamis berdasarkan folder tema
    this.load.audio('bgm-ingame', `/assets/audio/themes/${currentTheme}/ingame.mp3`);
    this.load.audio('sfx-correct', `/assets/audio/themes/${currentTheme}/correct.mp3`);
    this.load.audio('sfx-wrong', `/assets/audio/themes/${currentTheme}/wrong.mp3`);
    this.load.audio('sfx-hit', `/assets/audio/themes/${currentTheme}/hit.mp3`);
    this.load.audio('bgm-lobby', `/assets/audio/themes/${currentTheme}/lobby.mp3`);

    this.load.audio("sfx_timer", "assets/audio/soundreality-analog-timer-60-sec-2-startof-171599.mp3");
    this.load.audio("sfx_walk", "assets/audio/joentnt-walk-on-grass-1-291984.mp3");
    // Musuh & UI
    this.load.spritesheet("skeleton_idle", "/assets/characters/Skeleton/PNG/skeleton_idle_strip6.png", { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("skeleton_walk", "/assets/characters/Skeleton/PNG/skeleton_walk_strip8.png", { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("skeleton_death", "/assets/characters/Skeleton/PNG/skeleton_death_strip10.png", { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("skeleton_attack", "/assets/characters/Skeleton/PNG/skeleton_attack_strip7.png", { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("skeleton_hurt", "/assets/characters/Skeleton/PNG/skeleton_hurt_strip7.png", { frameWidth: 96, frameHeight: 64 });
    
    this.load.spritesheet("goblin_idle", "/assets/characters/Goblin/PNG/spr_idle_strip9.png", { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("goblin_walk", "/assets/characters/Goblin/PNG/spr_walk_strip8.png", { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("goblin_death", "/assets/characters/Goblin/PNG/spr_death_strip13.png", { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("goblin_attack", "/assets/characters/Goblin/PNG/spr_attack_strip10.png", { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("goblin_hurt", "/assets/characters/Goblin/PNG/spr_hurt_strip8.png", { frameWidth: 96, frameHeight: 64 });
    
    const goblinPath = "/assets/characters/Goblin/PNG";
    this.load.spritesheet("goblin_dig", `${goblinPath}/spr_dig_strip13.png`, { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("goblin_water", `${goblinPath}/spr_watering_strip5.png`, { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("goblin_mine", `${goblinPath}/spr_mining_strip10.png`, { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("goblin_axe", `${goblinPath}/spr_axe_strip10.png`, { frameWidth: 96, frameHeight: 64 });
    
    this.load.image("expression_alert", "/assets/expression_alerted.png");
    this.load.spritesheet("chest_tiles", "/assets/tileset/spr_tileset_sunnysideworld_16px.png", { frameWidth: 16, frameHeight: 16 });

    // NPC
    const width = 24;  
    const height = 24; 
    for (let i = 1; i <= 6; i++) {
      const charId = `Char_00${i}`;
      this.load.spritesheet(`${charId}_Idle`, `/assets/characters/${charId}_Idle.png`, { frameWidth: width, frameHeight: height });
      this.load.spritesheet(`${charId}_Walk`, `/assets/characters/${charId}.png`, { frameWidth: width, frameHeight: height });
    }

    console.log(`[PreloadScene] Memuat peta: ${mapKey} (${mapUrl})`);
  }

  create(): void {
    const room = this.registry.get("room");
    this.scene.start("GameScene", { room });
  }
}