import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import crypto from "crypto";
 
const app = express();
 
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const rooms = new Map();
 
app.use(express.static("."));
app.get("/health", (_req, res) => res.json({ ok: true }));
 function makeRoomCode() {
let code;
do code = crypto.randomBytes(3).toString("hex").toUpperCase();
while (rooms.has(code));
return code;
}

function deck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const cards = [];
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) cards.push({ suit, rank });
  }
  return cards;
}

function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function newGame(room) {
  const cards = shuffle(deck());
  room.players[0].hand = cards.slice(0, 26);
  room.players[1].hand = cards.slice(26);
  room.players[0].score = 0;
  room.players[1].score = 0;
  room.turn = 0;
  room.round = 0;
  room.revealed = [null, null];
  room.status = "playing";
}

function send(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

function broadcast(room, data) {
  for (const p of room.players) if (p?.ws) send(p.ws, data);
}

function publicState(room) {
  return {
    roomCode: room.code,
    players: room.players.map((p, i) => p ? {
      name: p.name,
      score: p.score,
      cardCount: p.hand.length,
      ready: !!p.ws,
      index: i
    } : null),
    status: room.status,
    round: room.round,
    revealed: room.revealed,
    winner: room.winner ?? null
  };
}

function broadcastState(room) {
  broadcast(room, { type: "state", state: publicState(room) });
}

function finishRound(room) {
  const [a, b] = room.revealed;
  if (!a || !b) return;

  if (a.rank > b.rank) room.players[0].score++;
  else if (b.rank > a.rank) room.players[1].score++;

  room.round++;
  if (room.players[0].score >= 10 || room.players[1].score >= 10 ||
      room.players[0].hand.length === 0 || room.players[1].hand.length === 0) {
    room.status = "finished";
    room.winner = room.players[0].score > room.players[1].score ? 0 :
                  room.players[1].score > room.players[0].score ? 1 : null;
  } else {
    room.turn = 0;
    room.revealed = [null, null];
  }
}

wss.on("connection", ws => {
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "create") {
      const code = makeRoomCode();
      const room = {
        code,
        players: [{ ws, name: String(msg.name || "Player 1").slice(0, 20), hand: [], score: 0 }, null],
        status: "waiting",
        round: 0,
        turn: 0,
        revealed: [null, null]
      };
      rooms.set(code, room);
      ws.room = code; ws.playerIndex = 0;
      send(ws, { type: "joined", playerIndex: 0, state: publicState(room) });
      broadcastState(room);
      return;
    }

    if (msg.type === "join") {
      const code = String(msg.code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, { type: "error", message: "Room not found." });
      if (room.players[1]) return send(ws, { type: "error", message: "That room is full." });

      room.players[1] = { ws, name: String(msg.name || "Player 2").slice(0, 20), hand: [], score: 0 };
      ws.room = code; ws.playerIndex = 1;
      newGame(room);
      send(ws, { type: "joined", playerIndex: 1, state: publicState(room) });
      broadcast(room, { type: "gameStart" });
      broadcastState(room);
      return;
    }

    const room = rooms.get(ws.room);
    if (!room) return;

    if (msg.type === "play") {
      if (room.status !== "playing") return;
      if (ws.playerIndex !== room.turn) return send(ws, { type: "error", message: "Wait for your turn." });
      if (!room.players[0] || !room.players[1]) return;

      const hand = room.players[ws.playerIndex].hand;
      const card = hand.shift();
      room.revealed[ws.playerIndex] = card;

      if (room.revealed[0] && room.revealed[1]) {
        finishRound(room);
      } else {
        room.turn = ws.playerIndex === 0 ? 1 : 0;
      }
      broadcastState(room);
      return;
    }

    if (msg.type === "restart" && room.status === "finished" && room.players.every(Boolean)) {
      newGame(room);
      broadcast(room, { type: "gameStart" });
      broadcastState(room);
    }
  });

  ws.on("close", () => {
    const code = ws.room;
    const room = rooms.get(code);
    if (!room) return;
    const idx = ws.playerIndex;
    if (room.players[idx]?.ws === ws) room.players[idx].ws = null;
    room.status = "waiting";
    broadcast(room, { type: "error", message: "A player disconnected. Refresh or start a new room." });
    broadcastState(room);
    setTimeout(() => {
      if (room.players.every(p => !p?.ws)) rooms.delete(code);
    }, 60000);
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`War game running on port ${port}`));
