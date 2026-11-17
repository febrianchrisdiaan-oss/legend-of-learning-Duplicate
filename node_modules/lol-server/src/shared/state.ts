// server/src/shared/state.ts
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Enemy extends Schema {
  @type("number") x!: number;
  @type("number") y!: number;
  @type("string") ownerId!: string;
  @type("number") questionId!: number;
  @type("string") type!: string; // 'skeleton' | 'goblin'
  @type("string") task: string = "idle";
  @type("number") hp: number = 1;
  @type("boolean") isAlive: boolean = true;
  @type("boolean") isFleeing: boolean = false;
  @type("number") targetX: number = 0;
  @type("number") targetY: number = 0;
  @type("number") restUntil: number = 0;
  @type("number") spawnZoneIndex: number = -1;
  @type("boolean") isBusy: boolean = false;
  @type("number") lastRecalc: number = 0;
  @type("number") fleeStartTime: number = 0;
  @type("boolean") isResting: boolean = false;
  @type("number") maxHp: number = 3;
}

export class Question extends Schema {
  @type("number") id!: number;
  @type("string") text!: string;
  @type("string") imageUrl: string = "";
  @type("string") answerType: string = "text";
  @type(["string"]) options = new ArraySchema<string>();
  @type("number") correctAnswer!: number;
}

export class Chest extends Schema {
  @type("number") x!: number;
  @type("number") y!: number;
  @type("boolean") isCollected: boolean = false;
  @type("string") collectedBy: string = "";
}

export class Player extends Schema {
  @type("number") x!: number;
  @type("number") y!: number;
  @type("number") targetX: number = 0;
  @type("number") targetY: number = 0;
  @type("string") name!: string;
  @type("string") userId: string = "";
  @type("string") avatarUrl: string = "";
  @type("number") hairId: number = 0;
  @type("number") score: number = 0;
  @type("number") correctAnswers: number = 0;
  @type("number") wrongAnswers: number = 0;
  @type("number") answeredQuestions: number = 0;
  @type("boolean") isFinished: boolean = false;
  @type("number") finishTime: number = 0;
  @type("boolean") hasUsedChest: boolean = false;
  @type("boolean") hasSpeedBoost: boolean = false;
  @type("boolean") hasWrongAnswer: boolean = false;
  @type("number") lastWrongQuestionId: number = 0;
  @type("string") sessionId!: string;
  @type("string") subRoomId!: string;
  @type("number") spawnIndex: number = -1;
  @type("boolean") isHost: boolean = false;
  @type("boolean") isAttacking: boolean = false;
  @type("boolean") isIncomplete: boolean = false;
  @type(["number"]) questionOrder = new ArraySchema<number>();
  @type("number") hp: number = 100;
  @type("boolean") isDefeated: boolean = false;
  @type("number") totalResponseTime: number = 0; // Total waktu menjawab (dalam detik)
  @type("number") averageResponseTime: number = 0;
  @type("string") hairStyle: string = "base";
}

export class SubRoom extends Schema {
  @type("string") id!: string;
  @type("number") capacity!: number;
  @type(["string"]) playerIds = new ArraySchema<string>();
}

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Enemy }) enemies = new MapSchema<Enemy>();
  @type([Chest]) chests = new ArraySchema<Chest>();
  @type([Question]) questions = new ArraySchema<Question>();
  @type([SubRoom]) subRooms = new ArraySchema<SubRoom>();
  @type("string") difficulty!: string;
  @type("string") subject!: string;
  @type("number") gameStartTime: number = 0;
  @type("boolean") isPreparing: boolean = false;
  @type("boolean") isGameStarted: boolean = false;
  @type("boolean") isGameOver: boolean = false;
  @type("string") roomCode!: string;
  @type("string") hostId!: string;
  @type("number") countdown: number = 0;
  @type("number") countdownEndTime: number = 0;
  @type("number") totalTimeMinutes: number = 5;
  @type("string") questionLimit: string = "all";
  @type("boolean") isMusicEnabled: boolean = true;
}