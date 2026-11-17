// client/src/pages/hostMonitorPage.ts
import type { PageModule, PageContext } from "../core/PageManager";

export function createHostMonitorPage(getRoom: () => any): PageModule {
  let unsubscribeHandlers: (() => void)[] = [];

  return {
    mount({ container }: PageContext) {
      const room = getRoom();
      if (!room) {
        container.innerHTML = `<p style="color:red; padding:20px;">Room tidak ditemukan.</p>`;
        return;
      }

      // Ukuran asli map di game Phaser (Sesuaikan jika ukuran map-mu berbeda)
      const MAP_WIDTH = 2000;
      const MAP_HEIGHT = 2000;

      container.innerHTML = `
        <div style="min-height:100vh; background:#0a0a1a; color:white; font-family:sans-serif; padding:32px; box-sizing: border-box;">
          <h2 style="margin-top:0; margin-bottom:24px;">Dashboard Pengawasan Guru</h2>
          
          <div style="display:flex; gap:40px; flex-wrap:wrap; align-items:flex-start;">
            
            <!-- KOLOM KIRI: KONTROL & DAFTAR PEMAIN -->
            <div style="flex:1; min-width:300px; max-width:400px;">
              <div style="background:#1a1a2e; padding:20px; border-radius:12px; text-align:center; margin-bottom:24px; border:1px solid #333;">
                <p style="color:#aaa; font-size:14px; margin:0;">Kode Kelas</p>
                <p id="hm-room-code" style="font-size:42px; font-weight:bold; letter-spacing:8px; margin:12px 0; color:#4f46e5;">...</p>
                <p style="color:#aaa; font-size:13px; margin:0;">Bagikan kode ini ke siswa untuk bergabung</p>
              </div>
              
              <button id="hm-start-btn" style="width:100%; padding:14px; background:#4f46e5; color:white; border:none; border-radius:8px; font-size:16px; font-weight:bold; cursor:pointer; margin-bottom:20px; transition:0.2s;">
                Mulai Game Sekarang
              </button>
              <div id="hm-game-ended"></div>

              <h3 style="border-bottom:1px solid #333; padding-bottom:8px;">Daftar Kadet:</h3>
              <ul id="hm-player-list" style="list-style:none; padding:0; margin:0; max-height:400px; overflow-y:auto;"></ul>
            </div>

            <!-- KOLOM KANAN: RADAR LIVE MAP -->
            <div style="flex:1; min-width:500px;">
              <h3 style="margin-top:0; border-bottom:1px solid #333; padding-bottom:8px;">Live Radar Map</h3>
              <div style="padding:4px; background:#1a1a2e; border-radius:12px; display:inline-block; border:1px solid #333;">
                <div id="hm-live-map" style="position:relative; width:500px; height:500px; background-color:#1a1a2e; background-image:url('/assets/maps/map_preview.png'); background-size:100% 100%; background-repeat:no-repeat; border-radius:8px; overflow:hidden; box-shadow: inset 0 0 10px rgba(0,0,0,0.8);">
                <!-- Titik Pemain Akan Muncul Di Sini -->
              </div>
              </div>
              <p style="font-size:12px; color:#aaa; margin-top:12px;">
                <span style="display:inline-block; width:10px; height:10px; background:#4ade80; border-radius:50%; margin-right:6px;"></span> Hidup & Aktif
                <span style="display:inline-block; width:10px; height:10px; background:#ef4444; border-radius:50%; margin-left:16px; margin-right:6px;"></span> Gugur (Kalah)
              </p>
            </div>
            
          </div>
        </div>
      `;

      // 1. Update Kode Kelas
      const codeEl = document.getElementById("hm-room-code")!;
      function updateCode(): void {
        if (room.state.roomCode) codeEl.textContent = room.state.roomCode;
      }
      updateCode();
      room.onStateChange.once(updateCode);

      // 2. Setup Elemen DOM
      const listEl = document.getElementById("hm-player-list")!;
      const mapContainer = document.getElementById("hm-live-map")!;
      const playerDots: Record<string, HTMLDivElement> = {}; // Memori penyimpan elemen titik map

      // Fungsi untuk mengurutkan dan render list HTML
      function renderList(): void {
        listEl.innerHTML = "";
        
        // Konversi ke array agar bisa disortir berdasarkan skor
        const playersArray = Array.from(room.state.players.entries()) as [string, any][];
        playersArray.sort((a, b) => b[1].score - a[1].score);

        playersArray.forEach(([_, p]) => {
          const li = document.createElement("li");
          li.style.cssText = `padding:10px 14px; background:${p.isDefeated ? '#3f1a1a' : '#1a1a2e'}; margin-bottom:8px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; border: 1px solid #333;`;
          
          li.innerHTML = `
            <span style="font-weight:bold; color:${p.isDefeated ? '#ef4444' : 'white'};">${p.name}</span>
            <span style="font-size:13px; color:#aaa;">Skor: <span style="color:#4ade80; font-weight:bold;">${Math.round(p.score)}</span> (${p.correctAnswers}✓ / ${p.wrongAnswers}✗)</span>
          `;
          listEl.appendChild(li);
        });
      }

      // 3. EVENT KETIKA PEMAIN MASUK
      room.state.players.onAdd((player: any, sessionId: string) => {
        renderList(); // Update UI list

        // --- BUAT TITIK DI RADAR MAP ---
        const dotWrapper = document.createElement("div");
        dotWrapper.style.position = "absolute";
        dotWrapper.style.transform = "translate(-50%, -50%)"; // Posisikan tepat di tengah koordinat
        dotWrapper.style.transition = "left 0.15s linear, top 0.15s linear"; // Animasi pergerakan mulus
        dotWrapper.style.display = "flex";
        dotWrapper.style.flexDirection = "column";
        dotWrapper.style.alignItems = "center";
        dotWrapper.style.zIndex = "10";

        const dot = document.createElement("div");
        dot.style.width = "14px";
        dot.style.height = "14px";
        dot.style.backgroundColor = "#4ade80"; // Warna Hijau (Hidup)
        dot.style.borderRadius = "50%";
        dot.style.border = "2px solid white";
        dot.style.boxShadow = "0 0 8px rgba(0,0,0,0.8)";
        dot.style.transition = "background-color 0.3s";

        const label = document.createElement("div");
        label.textContent = player.name;
        label.style.color = "white";
        label.style.fontSize = "11px";
        label.style.fontWeight = "bold";
        label.style.marginTop = "4px";
        label.style.textShadow = "1px 1px 2px black, -1px -1px 2px black, 1px -1px 2px black, -1px 1px 2px black";
        label.style.whiteSpace = "nowrap";

        dotWrapper.appendChild(dot);
        dotWrapper.appendChild(label);
        mapContainer.appendChild(dotWrapper);
        playerDots[sessionId] = dotWrapper; // Simpan ke memori

        // --- UPDATE POSISI TITIK SECARA REALTIME ---
        const updatePosition = () => {
          // Rumus Konversi dari ukuran game (2000px) ke Persentase (0% - 100%)
          const xPercent = (player.x / MAP_WIDTH) * 100;
          const yPercent = (player.y / MAP_HEIGHT) * 100;
          
          dotWrapper.style.left = `${xPercent}%`;
          dotWrapper.style.top = `${yPercent}%`;
          
          // Ubah warna merah jika gugur
          dot.style.backgroundColor = player.isDefeated ? "#ef4444" : "#4ade80";
        };

        // Panggil posisi pertama kali saat baru masuk
        updatePosition();

        // Panggil posisi setiap kali pemain ini bergerak/update skor
        player.onChange(() => {
          renderList(); 
          updatePosition(); 
        });
      });

      // 4. EVENT KETIKA PEMAIN KELUAR
      room.state.players.onRemove((player: any, sessionId: string) => {
        renderList();
        
        // Hapus titik dari Radar Map
        if (playerDots[sessionId]) {
          playerDots[sessionId].remove();
          delete playerDots[sessionId];
        }
      });

      // 5. KONTROL GAME HOST
      const startBtn = document.getElementById("hm-start-btn") as HTMLButtonElement;
      startBtn.addEventListener("click", () => {
        room.send("startGame");
        startBtn.disabled = true;
        startBtn.style.background = "#4a4a6a";
        startBtn.textContent = "Game Sedang Berlangsung...";
      });

      room.onMessage("gameStarted", () => {
        startBtn.disabled = true;
        startBtn.style.background = "#4a4a6a";
        startBtn.textContent = "Game Sedang Berlangsung...";
      });

      room.onMessage("gameEnded", () => {
        document.getElementById("hm-game-ended")!.innerHTML =
          `<p style="color:#4ade80; font-weight:bold; margin-top:16px; font-size:18px; text-align:center;">🏁 Pertandingan Selesai! 🏁</p>`;
      });
    },

    unmount() {
      unsubscribeHandlers.forEach((fn) => fn());
      unsubscribeHandlers = [];
    },
  };
}