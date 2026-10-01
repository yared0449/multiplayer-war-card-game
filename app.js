let ws, playerIndex = null, state = null;

const $ = id => document.getElementById(id);
const rankName = r => ({11:"J",12:"Q",13:"K",14:"A"}[r] || r);

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onclose = () => setMessage("Connection lost. Refresh to reconnect.");
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === "error") return setMessage(msg.message);
    if (msg.type === "joined") {
      playerIndex = msg.playerIndex;
      state = msg.state;
      showGame();
      render();
    }
    if (msg.type === "state") { state = msg.state; render(); }
  };
}

function send(type, extra={}) {
  if (!ws || ws.readyState !== 1) return setMessage("Connecting...");
  ws.send(JSON.stringify({type, ...extra}));
}

function setMessage(t) { $("message").textContent = t; $("gameMessage").textContent = t; }

$("create").onclick = () => {
  const name = $("name").value.trim() || "Player 1";
  connect();
  setTimeout(() => send("create", {name}), 150);
};

$("showJoin").onclick = () => $("joinBox").classList.remove("hidden");

$("join").onclick = () => {
  const name = $("name").value.trim() || "Player 2";
  const code = $("code").value.trim().toUpperCase();
  if (code.length < 4) return setMessage("Enter the room code.");
  connect();
  setTimeout(() => send("join", {name, code}), 150);
};

$("play").onclick = () => send("play");
$("restart").onclick = () => send("restart");

$("copy").onclick = async () => {
  await navigator.clipboard.writeText(state.roomCode);
  $("copy").textContent = "Copied!";
  setTimeout(() => $("copy").textContent = "Copy Room Code", 1200);
};

function showGame() {
  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");
}

function renderCard(el, card) {
  if (!card) {
    el.className = "card back";
    el.textContent = "?";
    return;
  }
  el.className = "card" + ((card.suit === "♥" || card.suit === "♦") ? " red" : "");
  el.textContent = `${rankName(card.rank)}${card.suit}`;
}

function render() {
  if (!state) return;
  $("roomLabel").textContent = `Room: ${state.roomCode}`;
  for (let i=0;i<2;i++) {
    const p = state.players[i];
    if (p) {
      $(`p${i}name`).textContent = p.name + (i === playerIndex ? " (You)" : "");
      $(`p${i}score`).textContent = p.score;
      $(`p${i}`).classList.toggle("active", state.status === "playing" && state.turn === i);
    } else {
      $(`p${i}name`).textContent = "Waiting for player…";
      $(`p${i}score`).textContent = "0";
    }
  }
  renderCard($("card0"), state.revealed[0]);
  renderCard($("card1"), state.revealed[1]);

  if (state.status === "waiting") {
    $("turn").textContent = `Share room code ${state.roomCode} with your opponent.`;
    $("play").disabled = true;
    $("restart").classList.add("hidden");
  } else if (state.status === "playing") {
    $("turn").textContent = state.turn === playerIndex ? "Your turn — flip your card!" : "Waiting for your opponent…";
    $("play").disabled = state.turn !== playerIndex;
    $("restart").classList.add("hidden");
  } else {
    $("turn").textContent = state.winner === null ? "Draw!" :
      state.winner === playerIndex ? "🏆 You win!" : "🏆 Your opponent wins!";
    $("play").disabled = true;
    $("restart").classList.remove("hidden");
  }
}
