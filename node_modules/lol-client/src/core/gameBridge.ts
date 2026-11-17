// client/src/core/gameBridge.ts
let pendingRoom: any = null;

export function setPendingRoom(room: any) {
  pendingRoom = room;

  if (room) {
    // --- LISTENER GLOBAL ANTI-GAGAL UNTUK GAME ENDED ---
    room.onMessage("gameEnded", (data: any) => {
      console.log("[GameBridge] Menerima sinyal gameEnded dari server! Payload mentah:", data);

      // Tangani format data: bisa berupa objek { rankings: [...] } atau langsung berupa Array [...]
      const rankingsArray = Array.isArray(data) ? data : (data?.rankings || []);
      console.log("[GameBridge] Data Rankings yang diproses:", rankingsArray);

      // 1. Matikan elemen game Phaser sepenuhnya
      const gameContainer = document.getElementById("game-container");
      const gameUiLayer = document.getElementById("game-ui-layer");
      if (gameContainer) gameContainer.style.display = "none";
      if (gameUiLayer) gameUiLayer.classList.add("hidden");

      // 2. Sembunyikan semua panel web lain
      document.getElementById("host-monitor-ui")?.classList.add("hidden");
      document.getElementById("waiting-room-ui")?.classList.add("hidden");
      document.getElementById("lobby-ui")?.classList.add("hidden");
      document.getElementById("login-ui")?.classList.add("hidden");
      document.getElementById("host-dashboard-ui")?.classList.add("hidden");

      // 3. Tampilkan Leaderboard
      const leaderboardOverlay = document.getElementById("leaderboard-overlay");
      const leaderboardList = document.getElementById("leaderboard-list");

      if (leaderboardList) {
        leaderboardList.innerHTML = "";
        
        if (rankingsArray.length > 0) {
          rankingsArray.forEach((r: any, idx: number) => {
            const item = document.createElement("div");
            item.className = "flex justify-between items-center p-3 bg-[#121216] rounded border border-[#333] text-xs";
            item.innerHTML = `
              <span class="text-accent font-bold">#${r.rank || (idx + 1)} ${r.name || r.username || "Kadet"}</span>
              <span class="text-primary">Skor: ${Math.round(r.score || 0)} (Benar: ${r.correctAnswers || 0})</span>
            `;
            leaderboardList.appendChild(item);
          });
        } else {
          leaderboardList.innerHTML = `<div class="text-center text-gray-400 py-4 text-xs">Tidak ada data skor pemain yang tercatat.</div>`;
        }
      }

      if (leaderboardOverlay) {
        leaderboardOverlay.classList.remove("hidden");
      }
    });
  }
}

export function getPendingRoom() {
  return pendingRoom;
}