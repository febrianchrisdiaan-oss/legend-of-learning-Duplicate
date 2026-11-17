import { Room, Client } from "colyseus";
import { GameState, Player, Question, Enemy, Chest } from "../shared/state";
import { MAP_CONFIGS, MAP_KEYS, MapConfig, MapKey } from "../shared/mapConfigs";

const ANSWER_TIME_LIMIT_MS = 12000; // 12 detik buat jawab
function sanitizeBarriers(raw: any): any[] {
  if (!Array.isArray(raw)) return [];
  const ok = (v: any): boolean => typeof v === "number" && Number.isFinite(v);
  const out: any[] = [];
  for (const b of raw.slice(0, 600)) {
    if (b?.type === "rect" && [b.x, b.y, b.width, b.height].every(ok)) {
      out.push({ type: "rect", x: b.x, y: b.y, width: b.width, height: b.height });
    } else if (b?.type === "poly" && Array.isArray(b.points) && b.points.length >= 3 && b.points.length <= 500 &&
               b.points.every((p: any) => ok(p?.x) && ok(p?.y))) {
      out.push({ type: "poly", points: b.points.map((p: any) => ({ x: p.x, y: p.y })) });
    }
  }
  return out;
}

export class GameRoom extends Room<GameState> {
  maxClients = 31;
  private barrierAreas: any[] = [];
  private enemyLastAttack: Map<string, number> = new Map(); 
  private answerTimers: Map<string, any> = new Map();
  private playersInQuiz: Set<string> = new Set();
  private playerGraceUntil: Map<string, number> = new Map();
  private playerLastRoll: Map<string, number> = new Map();
  private allowPlayerDeath: boolean = true;

  //debug
  private lastDebug = 0;   // field class
  
  // --- State AI Tambahan ---
  private enemyFacing: Map<string, { x: number, y: number }> = new Map();
  private enemyAlerted: Map<string, boolean> = new Map();
  private enemyStamina: Map<string, number> = new Map();
  private enemyExhausted: Map<string, boolean> = new Map();
  
  // --- KONFIGURASI GAME DARI GURU ---
  private gameMode: string = "default";
  private totalEnemiesToSpawn: number = 25;
  private enemyMaxHp: number = 2; 
  private totalQuestions: number = 50; 

  private awaiting = new Set<string>();
  private engaged = new Map<string, string>();
  private creatorIsHost = false;
  private lastMove = new Map<string, number>();
  
  // --- STATE MAP DINAMIS SAAT INI ---
  private currentConfig!: MapConfig;


  onCreate(options: any) {
    this.setState(new GameState());
    this.state.roomCode = options.isHost ? this.generateRoomCode() : (options.roomCode ?? "TEST01");
    this.setMetadata({ roomCode: this.state.roomCode }); 
    
    // TANGKAP DIFFICULTY DARI OPTIONS & SET CONFIG MAP
    const diff = String(options.difficulty ?? "easy").toLowerCase();
    this.state.difficulty = (MAP_KEYS as string[]).includes(diff) ? diff : "easy";
    this.currentConfig = MAP_CONFIGS[this.state.difficulty as MapKey];
    this.creatorIsHost = !!options.isHost;

    this.state.subject = options.subject ?? "math";
    this.state.gameStartTime = Date.now();
    this.state.isPreparing = true;

    // --- TANGKAP OPSI DARI DASHBOARD GURU ---
    if (options.isHost) {
      this.gameMode = options.mode || "default";
      
      if (this.gameMode === "custom") {
        this.totalEnemiesToSpawn = Math.min(60, Math.max(1, Math.floor(Number(options.customEnemies)) || 25));
        this.enemyMaxHp = Math.min(10, Math.max(1, Math.floor(Number(options.customHp)) || 2));
        this.allowPlayerDeath = options.allowPlayerDeath !== undefined ? options.allowPlayerDeath : true;
        if (Array.isArray(options.customQuestionsData)) options.customQuestionsData = options.customQuestionsData.slice(0, 200);
                
        // CEK APAKAH GURU MENGIRIMKAN SOAL CUSTOM
        if (options.customQuestionsData && options.customQuestionsData.length > 0) {
          this.totalQuestions = options.customQuestionsData.length;
          
          options.customQuestionsData.forEach((qData: any, index: number) => {
            const q = new Question();
            q.id = index;
            q.text = qData.question;
            
            const optionsArr = [qData.correct, qData.wrong1, qData.wrong2, qData.wrong3].sort(() => Math.random() - 0.5);
            q.correctAnswer = optionsArr.indexOf(qData.correct); 
            optionsArr.forEach(opt => q.options.push(opt));
            
            this.state.questions.push(q);
          });
          
          console.log(`[GameRoom] Berhasil memuat ${this.state.questions.length} soal CUSTOM dari guru.`);
        } else {
          this.generateDynamicQuestions(); 
        }
      } else {
        this.totalEnemiesToSpawn = 25;
        this.enemyMaxHp = 2;
        this.totalQuestions = 50;
        this.generateDynamicQuestions(); 
        this.allowPlayerDeath = true;
      }
    }

    this.onMessage("finishGame", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.isFinished) return;
      player.isFinished = true;
      player.finishTime = Date.now();
      this.checkGameEnd();
    });
    
    // --- FITUR GURU MEMAKSA GAME BERAKHIR ---
    this.onMessage("forceEndGame", (client) => {
      if (client.sessionId !== this.state.hostId) return;

      console.log("[GameRoom] Guru memaksa permainan diakhiri!");

      this.state.players.forEach((p) => {
        p.isFinished = true;
        if (!p.finishTime) p.finishTime = Date.now();
      });
      
      this.endGame();
    });

    // Server HANYA menerima data tembok, tidak usah menunggu untuk spawn
    this.onMessage("registerBarriers", (client, data: { barriers: any[] }) => {
      // Hanya terima dari host ATAU jika host tidak ikut masuk map, terima dari client pertama tapi kunci setelahnya
      if (this.barrierAreas.length > 0) return; 
      if (client.sessionId !== this.state.hostId && this.creatorIsHost) return; 

      this.barrierAreas = sanitizeBarriers(data?.barriers);
      console.log(`[GameRoom] Barrier didaftarkan oleh ${client.sessionId}`);
    });

    // PANGGIL SPAWN DI SINI (Di baris paling bawah sebelum penutup fungsi onCreate)
    this.spawnInitialEntities();

    this.onMessage("collectChest", (client, data: { chestIndex: number }) => {
      const player = this.state.players.get(client.sessionId);
      const chest = this.state.chests[data.chestIndex];
      if (player && chest && !chest.isCollected && !player.hasSpeedBoost) {
        chest.isCollected = true;
        chest.collectedBy = client.sessionId;
        player.hasSpeedBoost = true;
        client.send("speedBoostActivated");
        setTimeout(() => {
          const p = this.state.players.get(client.sessionId);
          if (p) {
            p.hasSpeedBoost = false;
            client.send("speedBoostDeactivated");
          }
        }, 5000);
      }
    });

    this.onMessage("engageEnemy", (client, data: { enemyId: string }) => {
      const enemy = this.state.enemies.get(data.enemyId);
      const me = this.state.players.get(client.sessionId);
      if (!me) { console.log("[engage] DITOLAK: pemain tidak ada di server"); return; }
      if (!enemy) { console.log("[engage] DITOLAK: musuh tidak ditemukan"); return; }
      if (me.isDefeated || !enemy.isAlive || enemy.isBusy) { console.log("[engage] DITOLAK: musuh sibuk / mati"); return; }

      enemy.isBusy = true;
      this.engaged.set(client.sessionId, data.enemyId);
      this.playersInQuiz.add(client.sessionId);
      this.assignQuestion(client, data.enemyId);
    });

    this.onMessage("submitAnswer", (client, data: { enemyId: string; selectedIndex: number; timeTaken: number }) => {
      const timerKey = `${client.sessionId}:${data.enemyId}`;
      const timer = this.answerTimers.get(timerKey);
      if (timer) {
        timer.clear();
        this.answerTimers.delete(timerKey);
      }
      this.resolveAnswer(client, data.enemyId, data.selectedIndex, data.timeTaken || 0);
    });

    this.onMessage("startGame", (client) => {
      if (client.sessionId !== this.state.hostId) return; 
      if (this.state.isGameStarted) return;
      this.state.isPreparing = false;
      this.state.isGameStarted = true;
      this.state.gameStartTime = Date.now();
      this.broadcast("gameStarted");
    });

    this.onMessage("movePlayer", (client, msg: { x: number; y: number }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || this.state.isGameOver || this.playersInQuiz.has(client.sessionId)) return;
      const x = Number(msg?.x), y = Number(msg?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const now = Date.now();
      const dt = Math.max(0.05, (now - (this.lastMove.get(client.sessionId) ?? now - 100)) / 1000);
      if (Math.hypot(x - p.x, y - p.y) > 400 * dt + 24) return;   // teleport / speed-hack
      this.lastMove.set(client.sessionId, now);
      p.x = Math.min(Math.max(x, 0), this.currentConfig.width);
      p.y = Math.min(Math.max(y, 0), this.currentConfig.height);
    });

    this.onMessage("sendEmoji", (client: Client, message: { emoji: string }) => {
      // Pastikan game belum dimulai (masih di ruang tunggu / lobby)
      if (!this.state.isGameStarted) {
        this.broadcast("playerEmoji", {
          sessionId: client.sessionId,
          emoji: message.emoji
        });
      }
    });

    this.onMessage("roll", (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.isDefeated) return;
      const now = Date.now();
      if (now - (this.playerLastRoll.get(client.sessionId) ?? 0) < 800) return; 
      this.playerLastRoll.set(client.sessionId, now);
      this.playerGraceUntil.set(client.sessionId, now + 550); 
    });

    this.clock.setInterval(() => this.updateEnemyAI(), 150);
  }
  

  // --- PEMBUAT SOAL MATEMATIKA DINAMIS ---
  private generateDynamicQuestions(): void {
    for (let i = 0; i < this.totalQuestions; i++) {
      const a = Math.floor(Math.random() * 20) + 1;
      const b = Math.floor(Math.random() * 20) + 1;
      const operators = ["+", "-", "x"];
      const op = operators[Math.floor(Math.random() * operators.length)];
      
      let answer = 0;
      if (op === "+") answer = a + b;
      if (op === "-") answer = a - b;
      if (op === "x") answer = a * b;

      let optionsArr = [
        answer.toString(),
        (answer + Math.floor(Math.random() * 5 + 1)).toString(),
        (answer - Math.floor(Math.random() * 5 + 1)).toString(),
        (answer + 10).toString()
      ].sort(() => Math.random() - 0.5); 

      const correctIndex = optionsArr.indexOf(answer.toString());
      const q = new Question();
      
      q.id = i; 
      q.text = `${a} ${op} ${b} = ?`;
      q.correctAnswer = correctIndex; 
      optionsArr.forEach(opt => q.options.push(opt));

      this.state.questions.push(q);
    }
    console.log(`[GameRoom] Berhasil generate ${this.state.questions.length} bank soal.`);
  }

  // --- FUNGSI MENDAPATKAN KOORDINAT DARI CONFIG DINAMIS ---
  private getPlayerSpawn(index: number): { x: number; y: number } {
    const spawns = this.currentConfig.players;
    const base = spawns[index % spawns.length];
    // Tambahkan sedikit sebaran (scatter) agar pemain tidak tertumpuk 100% di piksel yang sama
    return { 
      x: base[0] + (Math.random() - 0.5) * 24, 
      y: base[1] + (Math.random() - 0.5) * 24 
    };
  }

  // Mengambil titik acak DARI DAFTAR KOORDINAT yang sudah Anda buat

  private buildRankings() {
    return Array.from(this.state.players.entries())
      .map(([sessionId, p]) => ({
        sessionId, name: p.name, score: Math.round(p.score || 0),
        correctAnswers: p.correctAnswers || 0, wrongAnswers: p.wrongAnswers || 0,
        finishTime: p.finishTime || Date.now(), averageResponseTime: p.averageResponseTime || 0,
      }))
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.finishTime - b.finishTime))
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  private endGame(): void {
    if (this.state.isGameOver) return;
    this.state.isGameOver = true;
    this.broadcast("gameEnded", { rankings: this.buildRankings() });
  }

  // --- LOGIKA SPAWN SERVER ---
  private spawnInitialEntities(): void {
    const cfg = this.currentConfig;

    for (const p of cfg.chests) {
      const chest = new Chest();
      chest.x = p[0]; chest.y = p[1]; chest.isCollected = false;
      this.state.chests.push(chest);
    }

    const shuffle = <T,>(a: T[]): T[] => [...a].sort(() => Math.random() - 0.5);
    const poolQueue = shuffle(cfg.enemyPool);            // tiap titik dipakai maksimal sekali
    const zoneQueue = {
      water: shuffle(cfg.zones.water), axe: shuffle(cfg.zones.axe),
      mine: shuffle(cfg.zones.mine),   dig: shuffle(cfg.zones.dig),
    };
    const jitter = (v: number): number => v + (Math.random() - 0.5) * 12;
    
    const nextFromPool = (): { x: number; y: number } => {
      const p = poolQueue.pop();
      
      // Jika masih ada titik di queue, gunakan titik tersebut
      if (p) {
        return { x: p[0], y: p[1] };
      }
      
      // CADANGAN JIKA HABIS: Ambil titik acak dari konfigurasi asli (cfg.enemyPool)
      const fallbackPool = cfg.enemyPool;
      const randomPoint = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
      
      // Fallback ke {x: 100, y: 100} sekadar untuk keamanan darurat jika pool benar-benar kosong
      return randomPoint ? { x: randomPoint[0], y: randomPoint[1] } : { x: 100, y: 100 };
    };
    const taskNames = (["dig", "water", "mine", "axe"] as const).filter((t) => cfg.zones[t].length > 0);

    for (let i = 0; i < this.totalEnemiesToSpawn; i++) {
      const enemy = new Enemy();
      enemy.type = Math.random() < cfg.goblinRatio ? "goblin" : "skeleton";
      enemy.isAlive = true;
      enemy.targetX = Math.random() < 0.5 ? 1 : -1;
      enemy.isResting = false;
      enemy.restUntil = 0;
      enemy.maxHp = this.enemyMaxHp;
      enemy.hp = this.enemyMaxHp;

      let pos = { x: 0, y: 0 };
      enemy.task = "idle";

      if (enemy.type === "goblin" && Math.random() < 0.4) {
        // bekerja hanya kalau masih ada titik zona yang kosong (satu titik = satu goblin)
        const open = taskNames.filter((t) => zoneQueue[t].length > 0);
        if (open.length > 0) {
          const task = open[Math.floor(Math.random() * open.length)];
          const z = zoneQueue[task].pop()!;
          pos = { x: z[0], y: z[1] };
          enemy.task = task;
        }
      }
      if (enemy.task === "idle") pos = nextFromPool();

      enemy.x = jitter(pos.x);
      enemy.y = jitter(pos.y);
      this.state.enemies.set(`enemy_${Date.now()}_${i}`, enemy);
    }
    console.log(`[GameRoom] Spawn selesai: ${cfg.chests.length} peti & ${this.totalEnemiesToSpawn} musuh (${this.state.difficulty}).`);
  }

  // --- KUIS & JAWABAN ---
  private assignQuestion(client: Client, enemyId: string): void {
    if (!this.state.players.has(client.sessionId)) return; 
    const enemy = this.state.enemies.get(enemyId);
    if (!enemy || !enemy.isAlive) return;

    const question = this.state.questions[Math.floor(Math.random() * this.state.questions.length)];
    if (!question) return; 

    enemy.questionId = question.id;
    this.awaiting.add(client.sessionId);

    const timerKey = `${client.sessionId}:${enemyId}`;
    const oldTimer = this.answerTimers.get(timerKey);
    if (oldTimer) oldTimer.clear();

    const timer = this.clock.setTimeout(() => {
      this.resolveAnswer(client, enemyId, -1); 
    }, ANSWER_TIME_LIMIT_MS);
    this.answerTimers.set(timerKey, timer);

    client.send("questionAssigned", {
      enemyId,
      question: { id: question.id, text: question.text, options: question.options },
      timeLimitMs: ANSWER_TIME_LIMIT_MS,
    });
  }

  private resolveAnswer(client: Client, enemyId: string, selectedIndex: number, timeTaken: number = 0): void {
    if (!this.awaiting.delete(client.sessionId) || this.engaged.get(client.sessionId) !== enemyId) return;
    const player = this.state.players.get(client.sessionId);
    const enemy = this.state.enemies.get(enemyId);

    if (!player || !enemy || !enemy.isAlive) {
      this.playersInQuiz.delete(client.sessionId);
      this.engaged.delete(client.sessionId); if (enemy) enemy.isBusy = false;
      return;
    }

    const question = this.state.questions.find((q) => q.id === enemy.questionId);
    if (!question) {
      this.playersInQuiz.delete(client.sessionId);
      return;
    }

    const isCorrect = selectedIndex >= 0 && question.correctAnswer === selectedIndex;
    let continueQuiz = false;

    if (isCorrect) {
      enemy.hp = Math.max(0, enemy.hp - 1); // DARAH BERKURANG
      player.correctAnswers++;

      if (enemy.hp <= 0) {
        player.score += 15;
        enemy.isAlive = false;
        this.clock.setTimeout(() => {
            if (this.state.enemies.has(enemyId)) {
                this.state.enemies.delete(enemyId);
            }
        }, 1000);
      } else {
        player.score += 5;
        continueQuiz = true; 
      }
    } else {
      player.score = Math.max(0, player.score - 5);
      player.wrongAnswers++;
      enemy.isBusy = false; 

      this.broadcast("enemyAttacked", { enemyId: enemyId, targetId: client.sessionId });
    }

    if (selectedIndex !== -1) {
      player.totalResponseTime += timeTaken;
      const totalAnswered = player.correctAnswers + player.wrongAnswers;
      if (totalAnswered > 0) {
        player.averageResponseTime = player.totalResponseTime / totalAnswered;
      }
    }

    if (!continueQuiz) {
      this.playersInQuiz.delete(client.sessionId);
      this.playerGraceUntil.set(client.sessionId, Date.now() + 1200);
      this.engaged.delete(client.sessionId);
    }

    client.send("answerResult", {
      correct: isCorrect,
      enemyId,
      enemyHp: enemy.hp,
      enemyMaxHp: enemy.maxHp,
      enemyDefeated: enemy.hp <= 0,
      timedOut: selectedIndex === -1,
      continueQuiz,
    });

    if (continueQuiz) {
      this.clock.setTimeout(() => this.assignQuestion(client, enemyId), 1100);
    }
  }

  // --- LOGIKA AI & LAINNYA ---
  private updateEnemyAI(): void {
    if (this.state.isGameOver) return;
    const ALERT_RANGE_FRONT = 160; 
    const ALERT_RANGE_BACK = 70; 
    const FLEE_SPEED = 28;       
    const STAMINA_DRAIN = 4;     
    const STAMINA_RECOVER = 2;   
    const FREEZE_TIME_ON_ALERT = 1500; 
    const now = Date.now();

    if (now - this.lastDebug > 3000) {
      this.lastDebug = now;
      console.log(`[AI] pemain=${this.state.players.size} musuh=${this.state.enemies.size}`);
    }

    this.state.enemies.forEach((enemy, enemyKey) => {
      if (!this.enemyStamina.has(enemyKey)) {
        this.enemyStamina.set(enemyKey, 100);
        enemy.targetX = 1; 
        enemy.isResting = false; 
        enemy.restUntil = 0; 
        this.enemyAlerted.set(enemyKey, false); 
      }

      if (!enemy.isAlive || enemy.isBusy) {
        let stam = this.enemyStamina.get(enemyKey) || 0;
        this.enemyStamina.set(enemyKey, Math.min(100, stam + STAMINA_RECOVER));
        if (stam >= 100) enemy.isResting = false;
        this.enemyAlerted.set(enemyKey, false); 
        return;
      }

      let nearestPlayer: any = null;
      let nearestDist = Infinity;
      this.state.players.forEach((p) => {
        if (p.isDefeated) return;
        const dist = Math.hypot(p.x - enemy.x, p.y - enemy.y);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestPlayer = p;
        }
      });

      let stamina = this.enemyStamina.get(enemyKey)!;
      let isPanicked = this.enemyAlerted.get(enemyKey)!; 

      if (nearestPlayer && !isPanicked) {
        const dx = nearestPlayer.x - enemy.x;
        const dy = nearestPlayer.y - enemy.y;
        const isPlayerInFront = (dx * enemy.targetX) > 0;
        const detectionRange = isPlayerInFront ? ALERT_RANGE_FRONT : ALERT_RANGE_BACK;

        if (nearestDist < detectionRange) {
          this.enemyAlerted.set(enemyKey, true);
          this.broadcast("enemyAlerted", { enemyId: enemyKey });
          enemy.task = "idle"; 
          enemy.restUntil = now + FREEZE_TIME_ON_ALERT; 
          enemy.targetX = dx < 0 ? -1 : 1; 
          console.log(`[AI] ${enemyKey} kaget, jarak ${Math.round(nearestDist)}`);
        }
      }

      if (isPanicked) {
        if (now >= enemy.restUntil) {
          if (stamina > 0) {
            enemy.isResting = false;
            let moveX = 0, moveY = 0;
            if (nearestPlayer) {
              const dx = nearestPlayer.x - enemy.x;
              const dy = nearestPlayer.y - enemy.y;
              const len = Math.hypot(dx, dy) || 1;
              moveX = -(dx / len);
              moveY = -(dy / len);
            } else {
              moveX = enemy.targetX;
              moveY = 0;
            }

            // --- MEKANIK SLIDING / GESER OTOMATIS SAAT MENABRAK TEMBOK ---
            const steps = 3;
            const stepDist = FLEE_SPEED / steps;
            
            for (let i = 0; i < steps; i++) {
              const nextX = enemy.x + (moveX * stepDist);
              const nextY = enemy.y + (moveY * stepDist);

              const blockedX = this.isInsideBarrier(nextX, enemy.y);
              const blockedY = this.isInsideBarrier(enemy.x, nextY);

              if (!blockedX && !blockedY) {
                enemy.x = nextX;
                enemy.y = nextY;
              } else {
                if (!blockedX) {
                  enemy.x = nextX; 
                } else if (!blockedY) {
                  enemy.y = nextY; 
                } else {
                  moveX += (Math.random() - 0.5) * 0.8;
                  moveY += (Math.random() - 0.5) * 0.8;
                }
              }
            }

            enemy.targetX = moveX < 0 ? -1 : 1; 
            stamina -= STAMINA_DRAIN;
          } else {
            enemy.isResting = true; 
            isPanicked = false;     
            this.enemyAlerted.set(enemyKey, false);
            if (nearestPlayer) {
              const dx = nearestPlayer.x - enemy.x;
              enemy.targetX = dx < 0 ? -1 : 1;
            }
          }
        }
      } else {
        if (stamina < 100) stamina += STAMINA_RECOVER;
        if (stamina >= 100) enemy.isResting = false;
      }
      this.enemyStamina.set(enemyKey, Math.max(0, Math.min(100, stamina)));
    });
  }

  private defeatPlayer(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    if (!player || player.isDefeated) return;
    if (!this.allowPlayerDeath) return;
    player.isDefeated = true;
    player.isFinished = true; 
    player.finishTime = Date.now();
    this.clients.forEach((c) => {
      if (c.sessionId === sessionId) c.send("playerDefeated");
    });
    this.clock.setTimeout(() => this.checkGameEnd(), 2500);
  }

  private checkGameEnd(): void {
    if (this.state.players.size === 0) return;
    const allFinished = Array.from(this.state.players.values()).every((p) => p.isFinished);
    if (!allFinished) return;

    this.endGame();
  }

  private isInsideBarrier(px: number, py: number): boolean {
    const radius = 8; 
    
    // PERBAIKAN: TEMBOK OTOMATIS DI SISI SERVER
    // Mencegah monster kabur terobos ujung layar
    if (px - radius < 0 || px + radius > this.currentConfig.width || py - radius < 0 || py + radius > this.currentConfig.height) {
      return true;
    }

    for (const area of this.barrierAreas) {
      if (area.type === "rect") {
        if (px + radius > area.x && px - radius < area.x + area.width && py + radius > area.y && py - radius < area.y + area.height) {
          return true;
        }
      } else if (area.type === "poly") {
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

  onJoin(client: Client, options: any) {
    if (options.isHost) {
      this.state.hostId = client.sessionId;
      console.log(client.sessionId, "joined as HOST (spectator)");
      return; 
    }
    const player = new Player();
    player.name = options.name ?? "Kadet";
    player.sessionId = client.sessionId;
    player.hairStyle = options.hairStyle || "base";

    
    
    // PEMAIN DI SPAWN BERDASARKAN TINGKAT KESULITAN
    const spawn = this.getPlayerSpawn(this.state.players.size); 
    player.x = spawn.x;
    player.y = spawn.y;
    
    this.state.players.set(client.sessionId, player);
    console.log(client.sessionId, "joined as PLAYER pada koordinat X:", Math.round(player.x), "Y:", Math.round(player.y));
  }

  private generateRoomCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async onLeave(client: Client, consented: boolean) {
    // 1. JIKA HOST YANG REFRESH / TERPUTUS
    if (client.sessionId === this.state.hostId) {
      if (this.state.isGameOver) return;
      
      console.log(`[GameRoom] Host terputus, menahan sesi selama 2 jam...`);
      try {
        // Izinkan host menyambung kembali hingga 2 jam (7200 detik)
        await this.allowReconnection(client, 7200);
        console.log(`[GameRoom] Host berhasil kembali!`);
      } catch (e) {
        console.log(`[GameRoom] Sesi host berakhir sepenuhnya.`);
      }
      return;
    }

    // 2. JIKA SISWA / PEMAIN YANG REFRESH / TERPUTUS
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    // Jika terputus bukan karena keluar sukarela (misal: refresh browser)
    if (!consented && !this.state.isGameOver && !player.isFinished) {
      console.log(`[GameRoom] Kadet ${player.name} terputus. Menunggu reconnect 30 detik...`);
      
      try {
        // Berikan waktu 30 detik untuk siswa melakukan reconnect
        await this.allowReconnection(client, 30);
        console.log(`[GameRoom] Kadet ${player.name} berhasil kembali ke permainan!`);
        return; // Berhenti agar data tidak dihapus
      } catch (e) {
        console.log(`[GameRoom] Waktu habis. Kadet ${player.name} gagal reconnect.`);
      }
    }

    // 3. CLEANUP JIKA KELUAR SUKARELA ATAU WAKTU HABIS
    const eid = this.engaged.get(client.sessionId);
    if (eid) { const e = this.state.enemies.get(eid); if (e) e.isBusy = false; }
    
    this.engaged.delete(client.sessionId);
    this.awaiting.delete(client.sessionId);
    this.lastMove.delete(client.sessionId);
    for (const [key, t] of this.answerTimers) {
      if (key.startsWith(client.sessionId + ":")) { t.clear(); this.answerTimers.delete(key); }
    }

    player.isFinished = true;
    if (!player.finishTime) player.finishTime = Date.now();

    this.playersInQuiz.delete(client.sessionId);
    this.playerGraceUntil.delete(client.sessionId);
    
    this.checkGameEnd();
  }

  onDispose() {
    console.log("Room", this.roomId, "disposed");
  }
}