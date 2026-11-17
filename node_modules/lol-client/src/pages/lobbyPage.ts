// client/src/pages/lobbyPage.ts
import { Router } from "../core/Router";
import type { PageModule, PageContext } from "../core/PageManager";

export function createLobbyPage(getRoom: () => any): PageModule {
  let gameStartedHandler: (() => void) | null = null;
  let playerEmojiHandler: ((data: { sessionId: string; emoji: string }) => void) | null = null;

  return {
    mount({ container }: PageContext) {
      const room = getRoom();
      if (!room) {
        container.innerHTML = `<p style="color:red; padding:20px;">Room tidak ditemukan.</p>`;
        return;
      }

      container.innerHTML = `
        <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; font-family:'Retro Gaming', monospace; background:#121216;">
          <div style="background:#1a1a20; padding:32px; border-radius:12px; width:380px; text-align:center; box-shadow: 0 -4px 0 0 #000, 0 4px 0 0 #000, -4px 0 0 0 #000, 4px 0 0 0 #000;">
            <h2 style="color:#72BF78; margin-bottom:6px; font-size:22px;">Ruang Tunggu</h2>
            <p style="color:#A0D683; font-size:13px; margin-bottom:16px;">Kode Kelas: <strong style="color:#FEFF9F; letter-spacing: 2px;">${room.state.roomCode || '---'}</strong></p>

            <div id="lobby-status" style="color:#A0D683; font-size:13px; margin-bottom:14px;">
              Menunggu guru memulai permainan...
            </div>

            <div style="text-align:left; margin-bottom:16px;">
              <p style="color:#aaa; font-size:11px; margin-bottom:8px;">Kadet yang bergabung:</p>
              <ul id="lobby-player-list" style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; max-height:140px; overflow-y:auto;"></ul>
            </div>

            <!-- PANEL CHAT EMOJI DI LOBBY -->
            <div style="border-top: 1px solid #333; padding-top: 12px;">
              <p style="color:#aaa; font-size:10px; margin-bottom:6px;">Kirim Ekspresi:</p>
              <div style="display:flex; justify-content:center; gap:8px;">
                <button class="emoji-btn" data-emoji="👋" style="background:#26262e; border:1px solid #444; border-radius:6px; padding:6px 10px; cursor:pointer; font-size:16px;">👋</button>
                <button class="emoji-btn" data-emoji="😂" style="background:#26262e; border:1px solid #444; border-radius:6px; padding:6px 10px; cursor:pointer; font-size:16px;">😂</button>
                <button class="emoji-btn" data-emoji="🔥" style="background:#26262e; border:1px solid #444; border-radius:6px; padding:6px 10px; cursor:pointer; font-size:16px;">🔥</button>
                <button class="emoji-btn" data-emoji="👍" style="background:#26262e; border:1px solid #444; border-radius:6px; padding:6px 10px; cursor:pointer; font-size:16px;">👍</button>
                <button class="emoji-btn" data-emoji="😎" style="background:#26262e; border:1px solid #444; border-radius:6px; padding:6px 10px; cursor:pointer; font-size:16px;">😎</button>
              </div>
            </div>
          </div>
        </div>
      `;

      const listEl = document.getElementById("lobby-player-list")!;

      function renderList(): void {
        if (!listEl || !room.state || !room.state.players) return;
        listEl.innerHTML = "";
        
        room.state.players.forEach((p: any, sessionId: string) => {
          const li = document.createElement("li");
          li.id = `player-item-${sessionId}`;
          li.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:#121216; border-radius:6px; color:#FEFF9F; font-size:12px; border: 1px solid #333;";
          
          const nameSpan = document.createElement("span");
          nameSpan.textContent = p.name || "Kadet Misterius";
          li.appendChild(nameSpan);

          const emojiSpan = document.createElement("span");
          emojiSpan.className = "player-emoji-bubble";
          emojiSpan.style.cssText = "font-size:14px; transition: transform 0.2s;";
          li.appendChild(emojiSpan);

          listEl.appendChild(li);
        });

        if (room.state.players.size === 0) {
          listEl.innerHTML = `<li style="color:#666; font-size:12px; text-align:center; padding:10px;">Belum ada pemain lain...</li>`;
        }
      }

      room.state.players.onAdd(renderList);
      room.state.players.onRemove(renderList);
      renderList();

      // Event klik tombol emoji
      container.querySelectorAll(".emoji-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const emoji = btn.getAttribute("data-emoji");
          if (emoji) {
            room.send("sendEmoji", { emoji });
          }
        });
      });

      // Menerima broadcast emoji dari server
      playerEmojiHandler = (data: { sessionId: string; emoji: string }) => {
        const playerItem = document.getElementById(`player-item-${data.sessionId}`);
        if (playerItem) {
          // Tambahkan "as HTMLElement" di sini agar TypeScript mengenali properti "style"
          const bubble = playerItem.querySelector(".player-emoji-bubble") as HTMLElement;
          
          if (bubble) {
            bubble.textContent = data.emoji;
            bubble.style.transform = "scale(1.4)";
            setTimeout(() => {
              bubble.style.transform = "scale(1)";
            }, 300);

            // Hilangkan emoji setelah 2.5 detik
            setTimeout(() => {
              if (bubble.textContent === data.emoji) {
                bubble.textContent = "";
              }
            }, 2500);
          }
        }
      };
      room.onMessage("playerEmoji", playerEmojiHandler);

      // Jika game sudah berjalan saat halaman dimuat
      if (room.state.isGameStarted) {
        Router.navigate("/play");
        return;
      }

      // Handler ketika guru menekan tombol mulai
      gameStartedHandler = () => {
        Router.navigate("/play");
      };
      room.onMessage("gameStarted", gameStartedHandler);
    },

    unmount() {
      const room = getRoom();
      if (room) {
        if (gameStartedHandler) room.removeAllListeners("gameStarted");
        if (playerEmojiHandler) room.removeAllListeners("playerEmoji");
      }
      gameStartedHandler = null;
      playerEmojiHandler = null;
    },
  };
}