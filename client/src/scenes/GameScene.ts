// client/src/scenes/GameScene.ts
import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { MAP_CONFIGS } from "../config/mapConfigs";

interface BarrierRect { type: "rect"; x: number; y: number; width: number; height: number; }
interface BarrierPoly { type: "poly"; points: { x: number; y: number }[]; }
type Barrier = BarrierRect | BarrierPoly;

export class GameScene extends Phaser.Scene {
  private room!: Room;
  private map!: Phaser.Tilemaps.Tilemap;
  private player!: Phaser.GameObjects.Sprite;
  private playerHairSprite!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key; };
  private barrierAreas: Barrier[] = [];
  private lastNetworkSendTime = 0;
  private readonly networkSendRate = 100;
  private chestSprites: Phaser.GameObjects.Sprite[] = [];
  private hasSpeedBoost = false;
  private isAttacking = false;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private stamina = 100;
  private readonly maxStamina = 100;
  private isExhausted = false;
  private exhaustedUntil = 0;
  private sweatIcon!: Phaser.GameObjects.Image;
  private enemyHpBg: Record<string, Phaser.GameObjects.Rectangle> = {};
  private enemyHpFill: Record<string, Phaser.GameObjects.Rectangle> = {};
  private pendingEngage = false;
  private quizTimerInterval: ReturnType<typeof setInterval> | null = null;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private isRolling = false;
  private rollEndsAt = 0;
  private rollCooldownUntil = 0;
  private rollDir = { x: 1, y: 0 };
  private isDead = false;
  private npcBots: Phaser.GameObjects.Sprite[] = [];
  private npcChatTimer: ReturnType<typeof setTimeout> | null = null;
  private enemySweatIcons: Record<string, Phaser.GameObjects.Image> = {};
  private isHurt = false;
  private difficultyKey = "easy";
  private joystickVector = { x: 0, y: 0 };
  
  // Properti Gaya Rambut Pemain
  private playerHairStyle = "base";
  
  // [SFX] Properti Audio
  private lastStepTime = 0; 
  private bgmInGame!: Phaser.Sound.BaseSound;
  private sfxCorrect!: Phaser.Sound.BaseSound;
  private sfxWrong!: Phaser.Sound.BaseSound;
  private sfxHit!: Phaser.Sound.BaseSound;
  
  // --- Pemain lain & Musuh ---
  private otherPlayers: Record<string, Phaser.GameObjects.Sprite> = {};
  private otherPlayerNames: Record<string, Phaser.GameObjects.Text> = {};
  private enemySprites: Record<string, Phaser.GameObjects.Sprite> = {};
  private currentEnemyId: string | null = null;
  private enemyTargets: Record<string, { x: number; y: number }> = {};

  constructor() {
    super("GameScene");
  }

  init(data: { room: Room }): void {
    this.room = data.room;
  }

  private updateLiveLeaderboard(): void {
    const topPlayersEl = document.getElementById("hud-top-players");
    const myRankEl = document.getElementById("hud-my-rank");
    if (!topPlayersEl || !myRankEl || !this.room?.state?.players) return;

    const playersList: { sessionId: string; name: string; score: number }[] = [];
    this.room.state.players.forEach((player: any, sessionId: string) => {
      playersList.push({
        sessionId,
        name: player.name || "Kadet",
        score: player.score || 0,
      });
    });

    playersList.sort((a, b) => b.score - a.score);

    const top3 = playersList.slice(0, 3);
    topPlayersEl.innerHTML = "";

    top3.forEach((p, idx) => {
      const row = document.createElement("div");
      row.className = "flex justify-between items-center px-1 py-0.5 rounded bg-white/5";
      
      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
      row.innerHTML = `
        <span class="truncate max-w-[100px]">${medal} ${p.name}</span>
        <span class="text-accent font-bold">${Math.round(p.score)}</span>
      `;
      topPlayersEl.appendChild(row);
    });

    if (top3.length === 0) {
      topPlayersEl.innerHTML = `<div class="text-center text-gray-400 italic text-[10px]">Belum ada pemain</div>`;
    }

    const myIndex = playersList.findIndex((p) => p.sessionId === this.room.sessionId);
    if (myIndex !== -1) {
      const myData = playersList[myIndex];
      myRankEl.textContent = `Peringkat Anda: #${myIndex + 1} (${Math.round(myData.score)} pts)`;
    } else {
      myRankEl.textContent = `Peringkat Anda: -`;
    }
  }

  private setupEnemySync(): void {
    this.room.state.enemies.onAdd((enemyState: any, enemyId: string) => {
      const spriteKey = enemyState.type === "goblin" ? "goblin_idle" : "skeleton_idle";
      const sprite = this.add.sprite(enemyState.x, enemyState.y, spriteKey);
      sprite.setDepth(8);
      sprite.play(spriteKey === "goblin_idle" ? "goblin_idle_anim" : "skeleton_idle_anim");
      sprite.setInteractive({
        hitArea: new Phaser.Geom.Circle(48, 36, 22), 
        hitAreaCallback: Phaser.Geom.Circle.Contains,
        useHandCursor: true,
      });
      sprite.on("pointerdown", () => this.tryEngageEnemy(enemyId, sprite));

      const hpBg = this.add.rectangle(enemyState.x, enemyState.y - 24, 28, 4, 0x000000, 0.6).setDepth(8.5);
      const hpFill = this.add.rectangle(enemyState.x - 14, enemyState.y - 24, 28, 4, 0xe74c3c).setDepth(8.6).setOrigin(0, 0.5);

      const sweatIcon = this.add.image(enemyState.x, enemyState.y - 35, "expression_working");
      sweatIcon.setDepth(20).setScale(1.2).setVisible(false);
      this.enemySweatIcons[enemyId] = sweatIcon;

      this.enemySprites[enemyId] = sprite;
      this.enemyHpBg[enemyId] = hpBg;
      this.enemyHpFill[enemyId] = hpFill;
      this.enemyTargets[enemyId] = { x: enemyState.x, y: enemyState.y };

      const updateHpBar = (): void => {
        const ratio = enemyState.maxHp > 0 ? enemyState.hp / enemyState.maxHp : 0;
        hpFill.width = 28 * Math.max(0, ratio);
      };
      updateHpBar();

      enemyState.onChange(() => {
        this.enemyTargets[enemyId] = { x: enemyState.x, y: enemyState.y };
        updateHpBar();

        if (!enemyState.isAlive) {
          const deathKey = enemyState.type === "goblin" ? "goblin_death_anim" : "skeleton_death_anim";
          sprite.disableInteractive();
          sprite.play(deathKey);
          sprite.once("animationcomplete", () => {
            this.tweens.add({
              targets: [sprite, hpBg, hpFill],
              alpha: 0,
              duration: 300,
              onComplete: () => { hpBg.destroy(); hpFill.destroy(); },
            });
          });
        }
      });
    });

    this.room.state.enemies.onRemove((_enemyState: any, enemyId: string) => {
      this.enemySprites[enemyId]?.destroy();
      delete this.enemySprites[enemyId];
      this.enemyHpBg[enemyId]?.destroy();
      delete this.enemyHpBg[enemyId];
      this.enemyHpFill[enemyId]?.destroy();
      delete this.enemyHpFill[enemyId];
      delete this.enemyTargets[enemyId];
      this.enemySweatIcons[enemyId]?.destroy();
      delete this.enemySweatIcons[enemyId];
    });

    this.room.onMessage("enemyAttacked", (data: { enemyId: string, targetId: string }) => {
      const sprite = this.enemySprites[data.enemyId];
      const enemyState = this.room.state.enemies.get(data.enemyId);
      
      if (sprite && enemyState && sprite.active) {
        const isGoblin = enemyState.type === "goblin";
        const attackAnim = isGoblin ? "goblin_attack_anim" : "skeleton_attack_anim";

        if (data.targetId === this.room.sessionId) {
          sprite.setFlipX(this.player.x < sprite.x);
          
          if (this.sfxHit) this.sfxHit.play();

          this.isHurt = true;
          this.time.delayedCall(900, () => { this.isHurt = false; });
          this.player.play("hurt", true);
          this.player.once("animationcomplete-hurt", () => {
            this.isHurt = false;
          });
          
        } else if (this.otherPlayers[data.targetId]) {
          sprite.setFlipX(this.otherPlayers[data.targetId].x < sprite.x);
        }

        sprite.setData("isAttacking", true);
        sprite.stop(); 
        sprite.play(attackAnim, true);
        
        sprite.once("animationcomplete", (anim: Phaser.Animations.Animation) => {
          if (anim.key === attackAnim) sprite.setData("isAttacking", false);
        });
      }
    });

    this.room.onMessage("enemyAlerted", (data: { enemyId: string }) => {
      const sprite = this.enemySprites[data.enemyId];
      if (sprite) {
        const alertIcon = this.add.image(sprite.x, sprite.y - 35, "expression_alert");
        alertIcon.setDepth(15);
        
        this.tweens.add({
          targets: alertIcon,
          y: sprite.y - 50,
          alpha: 0,
          duration: 1000,
          ease: 'Power1',
          onComplete: () => alertIcon.destroy()
        });
      }
    });
  }

  private updateEnemies(): void {
    Object.keys(this.enemySprites).forEach((enemyId) => {
      const sprite = this.enemySprites[enemyId];
      const target = this.enemyTargets[enemyId];
      if (!sprite || !target || !sprite.active) return;

      const dx = target.x - sprite.x;
      const dy = target.y - sprite.y;
      const dist = Math.hypot(dx, dy);

      sprite.x += dx * 0.15;
      sprite.y += dy * 0.15;

      const hpBg = this.enemyHpBg[enemyId];
      const hpFill = this.enemyHpFill[enemyId];
      if (hpBg && hpFill) {
        hpBg.setPosition(sprite.x, sprite.y - 24);
        hpFill.setPosition(sprite.x - 14, sprite.y - 24);
      }

      const enemyState = this.room.state.enemies.get(enemyId);
      if (!enemyState || !enemyState.isAlive) return;

      const sweatIcon = this.enemySweatIcons[enemyId];
      if (sweatIcon) {
        sweatIcon.setPosition(sprite.x, sprite.y - 35);
        sweatIcon.setVisible(enemyState.isResting);
      }

      if (sprite.getData("isAttacking")) {
        return; 
      }

      const isGoblin = enemyState.type === "goblin";

      if (enemyState.isResting) {
        sprite.play(isGoblin ? "goblin_idle_anim" : "skeleton_idle_anim", true);
        sprite.setFlipX(enemyState.targetX < 0);
      } else {
        if (dist > 1) {
          sprite.play(isGoblin ? "goblin_walk_anim" : "skeleton_walk_anim", true);
          sprite.setFlipX(enemyState.targetX < 0);
        } else {
          if (isGoblin && enemyState.task && enemyState.task !== "idle") {
            sprite.play(`goblin_${enemyState.task}_anim`, true);
          } else {
            sprite.play(isGoblin ? "goblin_idle_anim" : "skeleton_idle_anim", true);
          }
          sprite.setFlipX(enemyState.targetX < 0);
        }
      }
    });
  }

  private npcFacing(dx: number, dy: number): string {
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
    return dy < 0 ? "up" : "down";
  }

  private setupNPCBots(): void {
    const dirs = ["down", "left", "right", "up"];
    for (let i = 1; i <= 6; i++) {
      const id = `Char_00${i}`;
      dirs.forEach((d, row) => {
        this.anims.create({ key: `${id}_idle_${d}`, frames: this.anims.generateFrameNumbers(`${id}_Idle`, { start: row * 4, end: row * 4 + 3 }), frameRate: 5, repeat: -1 });
        this.anims.create({ key: `${id}_walk_${d}`, frames: this.anims.generateFrameNumbers(`${id}_Walk`, { start: row * 4, end: row * 4 + 3 }), frameRate: 8, repeat: -1 });
      });
    }

    const spawnPoints = (MAP_CONFIGS as any)[this.difficultyKey].npcs.map(([x, y]: number[]) => ({ x, y }));

    for (let i = 1; i <= Math.min(6, spawnPoints.length); i++) {
      const id = `Char_00${i}`;
      const pos = spawnPoints[i - 1];

      const bot = this.add.sprite(pos.x, pos.y, `${id}_Idle`, 0);
      bot.setDepth(9);
      bot.play(`${id}_idle_down`);
      bot.setInteractive({ useHandCursor: true });

      bot.setData("charId", id);
      bot.setData("facing", "down");
      bot.setData("home", { x: pos.x, y: pos.y });
      bot.setData("isMoving", false);
      bot.setData("moveDir", { x: 0, y: 0 });
      bot.setData("nextActionTime", this.time.now + Math.random() * 2000);

      bot.on("pointerdown", () => this.interactWithNPC(bot));
      this.npcBots.push(bot);
    }
  }

  private setupTouchJoystick(): void {
    const base = document.getElementById("joystick-base");
    const thumb = document.getElementById("joystick-thumb");
    const wrapper = document.getElementById("touch-joystick-wrapper");

    if (!base || !thumb || !wrapper) return;

    let activePointerId: number | null = null;
    const maxDistance = 40; 

    const handleTouchMove = (e: TouchEvent) => {
      if (activePointerId === null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === activePointerId) {
          const rect = base.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          let deltaX = touch.clientX - centerX;
          let deltaY = touch.clientY - centerY;
          const distance = Math.hypot(deltaX, deltaY);

          if (distance > maxDistance) {
            deltaX = (deltaX / distance) * maxDistance;
            deltaY = (deltaY / distance) * maxDistance;
          }

          thumb.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;

          this.joystickVector.x = deltaX / maxDistance;
          this.joystickVector.y = deltaY / maxDistance;
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activePointerId) {
          activePointerId = null;
          thumb.style.transform = "translate(-50%, -50%)";
          this.joystickVector = { x: 0, y: 0 };
        }
      }
    };

    wrapper.addEventListener("touchstart", (e) => {
      if (activePointerId === null && e.changedTouches.length > 0) {
        activePointerId = e.changedTouches[0].identifier;
        handleTouchMove(e);
      }
    });

    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);
  }

  private interactWithNPC(bot: Phaser.GameObjects.Sprite): void {
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, bot.x, bot.y);
    if (dist > 70) {
      this.showToast("Terlalu jauh untuk mengobrol!", false);
      return;
    }

    const id = bot.getData("charId") as string;
    const f = this.npcFacing(this.player.x - bot.x, this.player.y - bot.y);
    bot.setData("isMoving", false);
    bot.setData("facing", f);
    bot.play(`${id}_idle_${f}`, true);
    bot.setData("nextActionTime", this.time.now + 4000); 

    const dialogs = [
      "Halo kadet! Semangat berlatih hari ini!",
      "Aku dengar Goblin di utara makin agresif.",
      "Jangan lupa tekan Shift untuk lari, tapi perhatikan staminamu.",
      "Peti harta karun kuning akan memberimu kekuatan berlari cepat!",
      "Cuaca yang luar biasa untuk belajar, bukan?",
      "Kalau kamu dikepung, tekan Spasi untuk berguling menjauh!"
    ];
    
    const randomText = dialogs[Math.floor(Math.random() * dialogs.length)];
    
    const overlay = document.getElementById("npc-chat-overlay")!;
    const textEl = document.getElementById("npc-chat-text")!;
    textEl.textContent = randomText;
    overlay.style.display = "block";
    overlay.style.opacity = "1";

    if (this.npcChatTimer) clearTimeout(this.npcChatTimer);
    this.npcChatTimer = setTimeout(() => {
      overlay.style.opacity = "0";
      setTimeout(() => { overlay.style.display = "none"; }, 300);
    }, 3500);
  }

  private tryEngageEnemy(enemyId: string, sprite: Phaser.GameObjects.Sprite): void {
    if (this.isDead || this.isRolling) return;
    if (this.currentEnemyId || this.pendingEngage) return;

    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, sprite.x, sprite.y);
    if (dist > 60) return;

    const enemyState = this.room.state.enemies.get(enemyId);
    if (!enemyState || !enemyState.isAlive || enemyState.isBusy) return;

    this.pendingEngage = true;
    this.room.send("engageEnemy", { enemyId });
    this.time.delayedCall(1500, () => { this.pendingEngage = false; }); 
  }

  private showQuizPopup(question: any, enemyId: string, timeLimitMs: number): void {
    const overlay = document.getElementById("quiz-overlay");
    const questionEl = document.getElementById("quiz-question");
    const optionsEl = document.getElementById("quiz-options");
    const feedbackEl = document.getElementById("quiz-feedback");
    const timerBar = document.getElementById("quiz-timer-bar");

    if (!overlay || !questionEl || !optionsEl || !feedbackEl || !timerBar) return;

    feedbackEl.textContent = "";
    questionEl.textContent = question.text;
    optionsEl.innerHTML = "";

    const startTime = Date.now();

    question.options.forEach((opt: string, idx: number) => {
      const btn = document.createElement("button");
      btn.textContent = opt;
      btn.style.cssText = "padding:9px; border-radius:6px; border:none; background:#4f46e5; color:white; cursor:pointer; font-size:13px; text-align:left;";
      
      btn.onclick = () => {
        const e = new MouseEvent('click');
        document.dispatchEvent(e);

        const timeTaken = (Date.now() - startTime) / 1000;
        this.room.send("submitAnswer", { 
          enemyId, 
          selectedIndex: idx,
          timeTaken 
        });
        
        optionsEl.querySelectorAll("button").forEach((b) => ((b as HTMLButtonElement).disabled = true));
      };
      
      optionsEl.appendChild(btn);
    });

    overlay.style.display = "block";

    if (this.quizTimerInterval) clearInterval(this.quizTimerInterval);
    this.quizTimerInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1 - (elapsed / timeLimitMs));
      
      timerBar.style.width = `${remaining * 100}%`;
      timerBar.style.background = remaining < 0.3 ? "#e74c3c" : "#e8b84b";
      
      if (remaining <= 0 && this.quizTimerInterval) {
        clearInterval(this.quizTimerInterval);
        this.quizTimerInterval = null;
      }
    }, 100);
  }

  private setupChestSync(): void {
    this.room.state.chests.onAdd((chestState: any, index: number) => {
      const container = this.add.container(chestState.x, chestState.y);
      container.setDepth(7);

      const body = this.add.sprite(0, 0, "chest_tiles", 1956);
      const lid = this.add.sprite(0, -5, "chest_tiles", 1892);
      container.add([body, lid]);
      container.setSize(32, 32);
      container.setInteractive({ useHandCursor: true });

      container.on("pointerdown", () => {
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, container.x, container.y);
        if (dist > 50) return;
        this.room.send("collectChest", { chestIndex: index });
      });

      this.chestSprites[index] = container as unknown as Phaser.GameObjects.Sprite;

      chestState.onChange(() => {
        if (chestState.isCollected) {
          container.setVisible(false);
          container.disableInteractive();
        }
      });
    });

    this.room.onMessage("speedBoostActivated", () => {
      this.hasSpeedBoost = true;
      this.player.setTint(0xffff00);
      this.playerHairSprite.setTint(0xffff00);
    });

    this.room.onMessage("speedBoostDeactivated", () => {
      this.hasSpeedBoost = false;
      this.player.clearTint();
      this.playerHairSprite.clearTint();
    });
  }

  private setupHUD(): void {
    const myPlayerState = this.room.state.players.get(this.room.sessionId);
    if (!myPlayerState) return;

    const updateHUD = (): void => {
      const scoreEl = document.getElementById("hud-score");
      const correctEl = document.getElementById("hud-correct");
      const wrongEl = document.getElementById("hud-wrong");

      if (scoreEl) scoreEl.textContent = Math.round(myPlayerState.score).toString();
      if (correctEl) correctEl.textContent = myPlayerState.correctAnswers.toString();
      if (wrongEl) wrongEl.textContent = myPlayerState.wrongAnswers.toString();
    };

    updateHUD();
    myPlayerState.onChange(updateHUD);

    this.room.onMessage("playerDefeated", () => {
      this.isDead = true;
      this.isAttacking = false;
      this.isRolling = false;
      this.currentEnemyId = null;
      if (this.bgmInGame) this.bgmInGame.stop();

      const quizOverlay = document.getElementById("quiz-overlay");
      if (quizOverlay) quizOverlay.style.display = "none";
      
      const liveLb = document.getElementById("live-leaderboard-hud");
      if (liveLb) liveLb.classList.add("hidden");

      if (this.quizTimerInterval) {
        clearInterval(this.quizTimerInterval);
        this.quizTimerInterval = null;
      }

      this.sweatIcon.setVisible(false);
      this.player.clearTint();
      this.player.setAlpha(1);
      this.player.play("base_death", true);

      this.playerHairSprite.clearTint();
      this.playerHairSprite.setAlpha(1);
      this.playerHairSprite.play(`${this.playerHairStyle}_death`, true);

      this.playerHairSprite.once(`animationcomplete-${this.playerHairStyle}_death`, () => {
        this.time.delayedCall(500, () => {
          const defeatOverlay = document.getElementById("defeat-overlay");
          const hud = document.getElementById("hud");
          const finishBtn = document.getElementById("finish-btn");
          
          if (defeatOverlay) defeatOverlay.style.display = "flex";
          if (hud) hud.style.display = "none";
          if (finishBtn) finishBtn.style.display = "none";
        });
      });
    });
  }

  private setupPlayerSync(): void {
    this.room.state.players.onAdd((playerState: any, sessionId: string) => {
      this.updateLiveLeaderboard();

      if (sessionId === this.room.sessionId) {
        playerState.onChange(() => {
          this.updateLiveLeaderboard();
        });
        return;
      }

      const otherHair = playerState.hairStyle || "base";
      
      const sprite = this.add.sprite(playerState.x, playerState.y, "base_idle", 0);
      sprite.setDepth(9);
      sprite.setAlpha(0.8);
      sprite.play("base_idle");

      const hairSprite = this.add.sprite(playerState.x, playerState.y, `${otherHair}_idle`, 0);
      hairSprite.setDepth(10);
      hairSprite.setAlpha(0.8);
      hairSprite.play(`${otherHair}_idle`);
      
      if (playerState.isDefeated) {
        sprite.setData("dead", true);
        sprite.play("base_death");
        hairSprite.play(`${otherHair}_death`);
      }
      
      sprite.setData("targetX", playerState.x);
      sprite.setData("targetY", playerState.y);
      sprite.setData("hairSprite", hairSprite);
      sprite.setData("hairStyle", otherHair);

      const nameText = this.add.text(playerState.x, playerState.y - 20, playerState.name || "Pemain", {
        fontSize: "10px",
        color: "#ffffff",
        backgroundColor: "#00000088",
        padding: { x: 4, y: 2 },
      });
      nameText.setOrigin(0.5, 1);
      nameText.setDepth(11);

      this.otherPlayers[sessionId] = sprite;
      this.otherPlayerNames[sessionId] = nameText;

      playerState.onChange(() => {
        sprite.setData("targetX", playerState.x);
        sprite.setData("targetY", playerState.y);

        if (playerState.isDefeated && !sprite.getData("dead")) {
          sprite.setData("dead", true);
          sprite.setAlpha(1);
          sprite.play("base_death");
          hairSprite.setAlpha(1);
          hairSprite.play(`${otherHair}_death`);
        }
        this.updateLiveLeaderboard();
      });
    });

    this.room.state.players.onRemove((_playerState: any, sessionId: string) => {
      if (this.otherPlayers[sessionId]) {
        const hairSprite = this.otherPlayers[sessionId].getData("hairSprite") as Phaser.GameObjects.Sprite;
        hairSprite?.destroy();
        this.otherPlayers[sessionId].destroy();
        delete this.otherPlayers[sessionId];
      }
      if (this.otherPlayerNames[sessionId]) {
        this.otherPlayerNames[sessionId].destroy();
        delete this.otherPlayerNames[sessionId];
      }
      this.updateLiveLeaderboard();
    });
  }

  private updateOtherPlayers(): void {
    Object.keys(this.otherPlayers).forEach((sessionId) => {
      const sprite = this.otherPlayers[sessionId];
      const hairSprite = sprite.getData("hairSprite") as Phaser.GameObjects.Sprite;
      const nameText = this.otherPlayerNames[sessionId];
      const targetX = sprite.getData("targetX") as number;
      const targetY = sprite.getData("targetY") as number;
      const hair = sprite.getData("hairStyle") || "base";

      if (sprite.getData("dead")) {
        nameText.setPosition(sprite.x, sprite.y - 20);
        if (hairSprite) {
          hairSprite.setPosition(sprite.x, sprite.y);
        }
        return; 
      }

      const dx = targetX - sprite.x;
      const dy = targetY - sprite.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      sprite.x += dx * 0.15;
      sprite.y += dy * 0.15;

      if (hairSprite) {
        hairSprite.setPosition(sprite.x, sprite.y);
        hairSprite.setFlipX(sprite.flipX);
      }

      if (dist > 0.5) {
        sprite.play("base_walk", true);
        if (hairSprite) hairSprite.play(`${hair}_walk`, true);
        if (Math.abs(dx) > 0.1) {
          sprite.setFlipX(dx < 0);
          if (hairSprite) hairSprite.setFlipX(dx < 0);
        }
      } else {
        sprite.play("base_idle", true);
        if (hairSprite) hairSprite.play(`${hair}_idle`, true);
      }

      nameText.setPosition(sprite.x, sprite.y - 20);
    });
  }

  private parseBarriers(): void {
    this.barrierAreas = [];
    if (!this.map.objects || !Array.isArray(this.map.objects)) return;

    this.map.objects.forEach((layer: any) => {
      const layerName = (layer.name || "").toLowerCase();
      
      if (!(layerName.includes("barrier") || layerName.includes("barier") || layerName.includes("tembok")) || !layer.objects) return;

      for (const obj of layer.objects) {
        if (obj.width && obj.height && !obj.polygon) {
          this.barrierAreas.push({ type: "rect", x: obj.x ?? 0, y: obj.y ?? 0, width: obj.width, height: obj.height });
        } else if (obj.polygon) {
          const points = (obj.polygon as any[]).map((p) => ({ x: (obj.x ?? 0) + p.x, y: (obj.y ?? 0) + p.y }));
          this.barrierAreas.push({ type: "poly", points });
        }
      }
    });

    console.log(`[Barrier] ${this.barrierAreas.length} area collision dimuat.`);
  }

  private isInsideBarrier(px: number, py: number): boolean {
    const radius = 8;
    
    if (px - radius < 0 || px + radius > this.map.widthInPixels || py - radius < 0 || py + radius > this.map.heightInPixels) {
      return true;
    }

    for (const area of this.barrierAreas) {
      if (area.type === "rect") {
        if (px + radius > area.x && px - radius < area.x + area.width && py + radius > area.y && py - radius < area.y + area.height) {
          return true;
        }
      } else {
        let inside = false;
        const points = area.points;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const xi = points[i].x, yi = points[i].y;
          const xj = points[j].x, yj = points[j].y;
          const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
          if (intersect) inside = !inside;
        }
        if (inside) return true;
      }
    }
    return false;
  }

  private setupQuizSystem(): void {
    this.room.onMessage("questionAssigned", (data: { enemyId: string; question: any; timeLimitMs: number }) => {
      this.pendingEngage = false;
      if (this.currentEnemyId && this.currentEnemyId !== data.enemyId) return;
      this.currentEnemyId = data.enemyId;
      this.showQuizPopup(data.question, data.enemyId, data.timeLimitMs);
    });

    this.room.onMessage("answerResult", (data: any) => {
      if (data.enemyId !== this.currentEnemyId) return;

      const quizOverlay = document.getElementById("quiz-overlay");
      if (quizOverlay) quizOverlay.style.display = "none";
      
      if (this.quizTimerInterval) {
        clearInterval(this.quizTimerInterval);
        this.quizTimerInterval = null;
      }

      if (!data.continueQuiz) this.currentEnemyId = null;

      if (data.correct) {
        if (this.sfxCorrect) this.sfxCorrect.play();

        const enemySprite = this.enemySprites[data.enemyId];
        const enemyState = this.room.state.enemies.get(data.enemyId);
        
        if (enemySprite && enemyState) {
          this.player.setFlipX(enemySprite.x < this.player.x);
          this.playerHairSprite.setFlipX(enemySprite.x < this.player.x);
          
          const isGoblin = enemyState.type === "goblin";
          const hurtAnim = isGoblin ? "goblin_hurt_anim" : "skeleton_hurt_anim";
          
          enemySprite.setData("isAttacking", true); 
          enemySprite.stop();
          enemySprite.play(hurtAnim, true);
          
          enemySprite.once("animationcomplete", (anim: Phaser.Animations.Animation) => {
             if (anim.key === hurtAnim) enemySprite.setData("isAttacking", false);
          });
        }

        this.isAttacking = true;
        this.player.play("attack", true);
        this.playerHairSprite.play(`${this.playerHairStyle}_idle`, true);
        this.player.once("animationcomplete-attack", () => { this.isAttacking = false; });

        this.time.delayedCall(200, () => {
          if (this.sfxHit) this.sfxHit.play();
        });

      } else {
        if (this.sfxWrong) this.sfxWrong.play();
      }

      const msg = data.timedOut
        ? "Waktu habis! Serang lagi dari awal."
        : data.correct
        ? (data.enemyDefeated ? "Musuh kalah! 🎉" : `Kena! HP musuh ${data.enemyHp}/${data.enemyMaxHp}`)
        : "Salah! HP & skor berkurang. Serang lagi dari awal.";
      this.showToast(msg, data.correct);
      this.updateLiveLeaderboard();
    });
  }

  private moveWithCollision(dirX: number, dirY: number, totalDist: number): void {
    const steps = Math.max(1, Math.ceil(totalDist / 2));
    const stepDist = totalDist / steps;
    for (let i = 0; i < steps; i++) {
      const newX = this.player.x + dirX * stepDist;
      if (!this.isInsideBarrier(newX, this.player.y)) this.player.x = newX;
      const newY = this.player.y + dirY * stepDist;
      if (!this.isInsideBarrier(this.player.x, newY)) this.player.y = newY;
    }
  }

  private sendPosition(): void {
    const now = Date.now();
    if (now - this.lastNetworkSendTime > this.networkSendRate) {
      this.room.send("movePlayer", { x: this.player.x, y: this.player.y });
      this.lastNetworkSendTime = now;
    }
  }

  private showToast(text: string, success: boolean): void {
    const toast = document.createElement("div");
    toast.textContent = text;
    toast.style.cssText = `
      position:fixed; top:70px; left:50%; transform:translate(-50%,0);
      background:${success ? "#16a34a" : "#dc2626"}; color:white; padding:10px 20px;
      border-radius:8px; font-family:sans-serif; font-weight:bold; z-index:55; pointer-events:none;
      animation: toastPop 1.2s ease forwards;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1200);
  }

  create(): void {
    const savedBgmVol = parseFloat(localStorage.getItem("zigma_bgm_vol") ?? "0.3");
    const savedSfxVol = parseFloat(localStorage.getItem("zigma_sfx_vol") ?? "0.5");

    try {
      this.bgmInGame = this.sound.add("bgm-ingame", { volume: savedBgmVol, loop: true });
      this.sfxCorrect = this.sound.add("sfx-correct", { volume: savedSfxVol });
      this.sfxWrong = this.sound.add("sfx-wrong", { volume: savedSfxVol });
      this.sfxHit = this.sound.add("sfx-hit", { volume: savedSfxVol });
      this.bgmInGame.play();
    } catch (err) {
      console.warn("Gagal inisialisasi audio:", err);
    }

    // Tampilkan widget live leaderboard khusus in-game
    const liveLb = document.getElementById("live-leaderboard-hud");
    if (liveLb) liveLb.classList.remove("hidden");

    const difficulty = (this.room?.state?.difficulty || "easy").toLowerCase();
    this.difficultyKey = difficulty in MAP_CONFIGS ? difficulty : "easy";
    const mapKey = `map_${difficulty}`;

    this.map = this.make.tilemap({ key: mapKey });

    const tilesets = this.map.tilesets
      .map((ts) => this.map.addTilesetImage(ts.name, `${mapKey}:${ts.name}`))
      .filter((t): t is Phaser.Tilemaps.Tileset => t !== null);

    this.map.layers.forEach((layerData) => {
      try {
        const layer = this.map.createLayer(layerData.name, tilesets, 0, 0);
        if (layer && /awan|cloud/i.test(layerData.name)) layer.setDepth(50);
      } catch (e) {
        console.warn(`Lewati layer: ${layerData.name}`, e);
      }
    });
    
    this.setupTouchJoystick();

    this.map.layers.forEach((layerData) => {
      const existing = this.map.getLayer(layerData.name);
      if (existing && existing.tilemapLayer) return;
      try {
        this.map.createLayer(layerData.name, tilesets, 0, 0);
      } catch (e) {
        console.warn(`Lewati layer: ${layerData.name}`, e);
      }
    });

    this.parseBarriers();

    if (this.room) {
      this.room.send("registerBarriers", { barriers: this.barrierAreas });
    }

    const myState = this.room?.state?.players?.get(this.room.sessionId);
    this.playerHairStyle = myState?.hairStyle || localStorage.getItem("zigma_hair_style") || "base";

    const hairTypes = ["base", "bowlhair", "curlyhair", "longhair", "mophair", "shorthair", "spikeyhair"];
    hairTypes.forEach((hair) => {
      this.anims.create({ key: `${hair}_walk`, frames: this.anims.generateFrameNumbers(`${hair}_walk`, { start: 0, end: 7 }), frameRate: 10, repeat: -1 });
      this.anims.create({ key: `${hair}_idle`, frames: this.anims.generateFrameNumbers(`${hair}_idle`, { start: 0, end: 8 }), frameRate: 10, repeat: -1 });
      this.anims.create({ key: `${hair}_run`, frames: this.anims.generateFrameNumbers(`${hair}_run`, { start: 0, end: 7 }), frameRate: 14, repeat: -1 });
      this.anims.create({ key: `${hair}_death`, frames: this.anims.generateFrameNumbers(`${hair}_death`, { start: 0, end: 12 }), frameRate: 12, repeat: 0 });
    });

    this.anims.create({ key: "base_walk", frames: this.anims.generateFrameNumbers("base_walk", { start: 0, end: 7 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: "base_idle", frames: this.anims.generateFrameNumbers("base_idle", { start: 0, end: 8 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: "base_run", frames: this.anims.generateFrameNumbers("base_run", { start: 0, end: 7 }), frameRate: 14, repeat: -1 });
    this.anims.create({ key: "base_death", frames: this.anims.generateFrameNumbers("base_death", { start: 0, end: 12 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: "roll", frames: this.anims.generateFrameNumbers("base_roll", { start: 0, end: 9 }), frameRate: 20, repeat: 0 });
    this.anims.create({ key: "attack", frames: this.anims.generateFrameNumbers("base_attack", { start: 0, end: 9 }), frameRate: 14, repeat: 0 });

    this.anims.create({ key: "skeleton_idle_anim", frames: this.anims.generateFrameNumbers("skeleton_idle", { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: "goblin_idle_anim", frames: this.anims.generateFrameNumbers("goblin_idle", { start: 0, end: 8 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: "skeleton_death_anim", frames: this.anims.generateFrameNumbers("skeleton_death", { start: 0, end: 9 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: "goblin_death_anim", frames: this.anims.generateFrameNumbers("goblin_death", { start: 0, end: 12 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: "skeleton_walk_anim", frames: this.anims.generateFrameNumbers("skeleton_walk", { start: 0, end: 7 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: "goblin_walk_anim", frames: this.anims.generateFrameNumbers("goblin_walk", { start: 0, end: 7 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: "skeleton_attack_anim", frames: this.anims.generateFrameNumbers("skeleton_attack", { start: 0, end: 6 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: "goblin_attack_anim", frames: this.anims.generateFrameNumbers("goblin_attack", { start: 0, end: 9 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: "hurt", frames: this.anims.generateFrameNumbers("base_hurt", { start: 0, end: 7 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: "skeleton_hurt_anim", frames: this.anims.generateFrameNumbers("skeleton_hurt", { start: 0, end: 7 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: "goblin_hurt_anim", frames: this.anims.generateFrameNumbers("goblin_hurt", { start: 0, end: 7 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: "goblin_dig_anim", frames: this.anims.generateFrameNumbers("goblin_dig", { start: 0, end: 12 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: "goblin_water_anim", frames: this.anims.generateFrameNumbers("goblin_water", { start: 0, end: 4 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: "goblin_mine_anim", frames: this.anims.generateFrameNumbers("goblin_mine", { start: 0, end: 9 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: "goblin_axe_anim", frames: this.anims.generateFrameNumbers("goblin_axe", { start: 0, end: 9 }), frameRate: 10, repeat: -1 });

    const startX = myState?.x ?? 100;
    const startY = myState?.y ?? 100;

    this.player = this.add.sprite(startX, startY, "base_idle", 0).play("base_idle");
    this.player.setDepth(10);

    this.playerHairSprite = this.add.sprite(startX, startY, `${this.playerHairStyle}_idle`, 0).play(`${this.playerHairStyle}_idle`);
    this.playerHairSprite.setDepth(11);

    const applyResponsiveCamera = () => {
      const isMobileDevice = this.sys.game.device.os.android ||
                             this.sys.game.device.os.iOS ||
                             window.innerWidth < 900 ||
                             ('ontouchstart' in window);

      const zoomLevel = isMobileDevice ? 1.8 : 2.5;

      this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
      this.cameras.main.setZoom(zoomLevel);
      this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    };

    applyResponsiveCamera();
    this.scale.on("resize", applyResponsiveCamera, this);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasdKeys = this.input.keyboard.addKeys("W,A,S,D") as typeof this.wasdKeys;
      this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
      this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }

    this.sweatIcon = this.add.image(this.player.x, this.player.y - 28, "expression_working");
    this.sweatIcon.setDepth(12).setScale(1.3).setVisible(false);

    this.setupPlayerSync();
    this.setupEnemySync();
    this.setupChestSync();
    this.setupHUD();
    this.setupQuizSystem();
    this.setupNPCBots();
    this.updateLiveLeaderboard();

    this.room.onLeave((code: number) => {
      if (code === 1000) return;
      alert("Koneksi ke server terputus. Halaman akan dimuat ulang.");
      window.location.reload();
    });

    this.events.on('shutdown', () => {
        if (this.bgmInGame) this.bgmInGame.stop();
        if (this.quizTimerInterval) clearInterval(this.quizTimerInterval);
        if (this.npcChatTimer) clearTimeout(this.npcChatTimer);
        const l = document.getElementById("live-leaderboard-hud");
        if (l) l.classList.add("hidden");
    });

    this.events.on('destroy', () => {
        if (this.bgmInGame) this.bgmInGame.stop();
        if (this.quizTimerInterval) clearInterval(this.quizTimerInterval);
        if (this.npcChatTimer) clearTimeout(this.npcChatTimer);
        const l = document.getElementById("live-leaderboard-hud");
        if (l) l.classList.add("hidden");
    });
  }

  update(_time: number, delta: number): void {
    if (!this.player || !this.playerHairSprite) return;

    this.updateOtherPlayers();
    this.updateEnemies();

    const now = this.time.now;
    
    if (this.npcBots) {
      this.npcBots.forEach((bot) => {
        const id = bot.getData("charId") as string;

        if (now > bot.getData("nextActionTime")) {
          const willMove = Math.random() < 0.5;
          bot.setData("isMoving", willMove);

          if (willMove) {
            const home = bot.getData("home") as { x: number; y: number };
            let angle = Math.random() * Math.PI * 2;
            if (Phaser.Math.Distance.Between(bot.x, bot.y, home.x, home.y) > 90) {
              angle = Math.atan2(home.y - bot.y, home.x - bot.x); 
            }
            const dir = { x: Math.cos(angle), y: Math.sin(angle) };
            const f = this.npcFacing(dir.x, dir.y);
            bot.setData("moveDir", dir);
            bot.setData("facing", f);
            bot.play(`${id}_walk_${f}`, true);
            bot.setData("nextActionTime", now + 1000 + Math.random() * 2000);
          } else {
            bot.play(`${id}_idle_${bot.getData("facing")}`, true);
            bot.setData("nextActionTime", now + 2000 + Math.random() * 2000);
          }
        }

        if (bot.getData("isMoving")) {
          const dir = bot.getData("moveDir") as { x: number; y: number };
          const botDt = delta / 1000;
          const newX = bot.x + dir.x * 40 * botDt;
          const newY = bot.y + dir.y * 40 * botDt;
          if (!this.isInsideBarrier(newX, bot.y)) bot.x = newX;
          if (!this.isInsideBarrier(bot.x, newY)) bot.y = newY;
        }
      });
    }

    if (this.isDead) return;
    if (this.isAttacking) return;
    if (this.isHurt) return; 
    
    if (this.currentEnemyId) {
      this.player.play("base_idle", true);
      this.playerHairSprite.setPosition(this.player.x, this.player.y);
      this.playerHairSprite.play(`${this.playerHairStyle}_idle`, true);
      return;
    }

    const dt = delta / 3000;
    const velocity = { x: 0, y: 0 };

    if (this.cursors?.left?.isDown || this.wasdKeys?.A?.isDown) velocity.x -= 1;
    if (this.cursors?.right?.isDown || this.wasdKeys?.D?.isDown) velocity.x += 1;
    if (this.cursors?.up?.isDown || this.wasdKeys?.W?.isDown) velocity.y -= 1;
    if (this.cursors?.down?.isDown || this.wasdKeys?.S?.isDown) velocity.y += 1;

    if (this.joystickVector && (this.joystickVector.x !== 0 || this.joystickVector.y !== 0)) {
      velocity.x = this.joystickVector.x;
      velocity.y = this.joystickVector.y;
    }

    let moving = velocity.x !== 0 || velocity.y !== 0;

    if (moving && (!this.joystickVector || (this.joystickVector.x === 0 && this.joystickVector.y === 0))) {
      const len = Math.hypot(velocity.x, velocity.y);
      velocity.x /= len;
      velocity.y /= len;
    }

    const joystickSprint = this.joystickVector && Math.hypot(this.joystickVector.x, this.joystickVector.y) > 0.85;
    const wantsSprint = ((this.shiftKey?.isDown || joystickSprint) && !this.isExhausted && !this.isRolling && moving);
    let isSprintingNow = false;

    if (wantsSprint && this.stamina > 0) {
      isSprintingNow = true;
      this.stamina = Math.max(0, this.stamina - 75 * dt);
      if (this.stamina <= 0) {
        this.isExhausted = true;
        this.exhaustedUntil = now + 4800;
      }
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + 48 * dt);
    }

    const wasExhausted = this.isExhausted;
    if (this.isExhausted && now >= this.exhaustedUntil) this.isExhausted = false;

    const staminaBar = document.getElementById("hud-stamina-bar") as HTMLElement | null;
    if (staminaBar) {
      staminaBar.style.width = `${this.stamina}%`;
      staminaBar.style.background = this.isExhausted ? "#e74c3c" : "#3b9ee8";
      staminaBar.classList.toggle("exhausted-pulse", this.isExhausted);
    }

    if (this.sweatIcon) {
      this.sweatIcon.setPosition(this.player.x, this.player.y - 28);
      this.sweatIcon.setVisible(this.isExhausted);
    }

    if (this.isExhausted && !wasExhausted) {
      this.player.setTint(0x999999);
      this.player.setAlpha(0.75);
      this.playerHairSprite.setTint(0x999999);
      this.playerHairSprite.setAlpha(0.75);
    } else if (!this.isExhausted && wasExhausted) {
      this.player.clearTint();
      this.player.setAlpha(1);
      this.playerHairSprite.clearTint();
      this.playerHairSprite.setAlpha(1);
    }

    if (
      this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey) &&
      !this.isRolling && !this.isExhausted &&
      this.stamina >= 25 && now >= this.rollCooldownUntil
    ) {
      this.stamina -= 45;
      this.isRolling = true;
      this.rollEndsAt = now + 500;
      this.rollCooldownUntil = now + 1000;
      this.rollDir = moving ? { x: velocity.x, y: velocity.y } : { x: this.player.flipX ? -1 : 1, y: 0 };
      this.player.play("roll", true);
      this.playerHairSprite.play(`${this.playerHairStyle}_idle`, true);
      this.player.setAlpha(0.7);
      this.playerHairSprite.setAlpha(0.7);
      this.room.send("roll"); 
    }

    if (this.isRolling) {
      if (now >= this.rollEndsAt) {
        this.isRolling = false;
        this.player.setAlpha(this.isExhausted ? 0.75 : 1);
        this.playerHairSprite.setAlpha(this.isExhausted ? 0.75 : 1);
      } else {
        this.moveWithCollision(this.rollDir.x, this.rollDir.y, 260 * (Math.min(delta, 33) / 1000));
        this.playerHairSprite.setPosition(this.player.x, this.player.y);
        if (this.rollDir.x !== 0) {
          this.player.setFlipX(this.rollDir.x < 0);
          this.playerHairSprite.setFlipX(this.rollDir.x < 0);
        }
        this.sendPosition();
        return;
      }
    }

    let speed = this.hasSpeedBoost ? 220 : 130;
    if (isSprintingNow) speed *= 1.45;
    if (this.isExhausted) speed *= 0.6;

    this.playerHairSprite.setPosition(this.player.x, this.player.y);

    if (moving) {
      this.moveWithCollision(velocity.x, velocity.y, speed * (Math.min(delta, 33) / 1000));
      
      const animBase = isSprintingNow ? "base_run" : "base_walk";
      const animHair = isSprintingNow ? `${this.playerHairStyle}_run` : `${this.playerHairStyle}_walk`;

      this.player.play(animBase, true);
      this.playerHairSprite.play(animHair, true);

      if (velocity.x !== 0) {
        const isLeft = velocity.x < 0;
        this.player.setFlipX(isLeft);
        this.playerHairSprite.setFlipX(isLeft);
      }
      this.sendPosition();

    } else {
      this.player.play("base_idle", true);
      this.playerHairSprite.play(`${this.playerHairStyle}_idle`, true);
    }
  }
}