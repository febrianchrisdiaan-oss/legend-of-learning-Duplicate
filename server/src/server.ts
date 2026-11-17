// server/src/server.ts
import http from "http";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { GameRoom } from "./rooms/GameRoom";


const port = Number(process.env.PORT || 2567);
const app = express();
app.use(cors());
app.use(express.json());

const clientBuildPath = path.join(process.cwd(), "public");
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
}

const server = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server, maxPayload: 512 * 1024 }), // 512 KB cukup untuk barrier map Hard
});

app.get("/find-room/:code", async (req, res) => {
  const code = req.params.code;
  const rooms = await matchMaker.query({ name: "game_room" });

  console.log(`[find-room] Mencari kode "${code}", room aktif:`, rooms.map((r: any) => ({ roomId: r.roomId, metadata: r.metadata })));

  const match = rooms.find((r: any) => r.metadata?.roomCode === code);

  if (match) {
    res.json({ found: true, roomId: match.roomId });
  } else {
    res.json({ found: false });
  }
});

gameServer.define("game_room", GameRoom);

app.use("/colyseus", monitor());

gameServer.listen(port, "0.0.0.0");
console.log(`Listening on ws://localhost:${port}`);