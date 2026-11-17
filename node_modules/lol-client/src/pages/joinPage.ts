// client/src/pages/joinPage.ts
import { Client } from "colyseus.js";
import type { PageModule, PageContext } from "../core/PageManager";

export function createJoinPage(client: Client, profile: any, onRoomJoined: (room: any) => void): PageModule {
  return {
    mount({ container }: PageContext) {
      container.innerHTML = `
        <div style="min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#121216; color:white; font-family:'Retro Gaming', monospace;">
          <div style="background:#1a1a20; padding:32px; border-radius:12px; width:350px; text-align:center; box-shadow: 0 -4px 0 0 #000, 0 4px 0 0 #000, -4px 0 0 0 #000, 4px 0 0 0 #000;">
            <h2 style="color:#72BF78; margin-bottom:8px; font-size:24px;">MODE SISWA</h2>
            <p style="color:#aaa; font-size:12px; margin-bottom:20px;">Masukkan kode kelas dari guru.</p>
            
            <input type="text" id="join-room-code" style="width:100%; background:#121216; color:white; padding:12px; margin-bottom:16px; text-align:center; font-size:20px; letter-spacing:0.3em; text-transform:uppercase; border:1px solid #333; border-radius:6px; outline:none;" placeholder="KODE">
            
            <div style="display:flex; gap:8px;">
              <button id="btn-scan-qr" style="background:#2563eb; color:white; padding:12px; border-radius:6px; border:none; cursor:pointer;" title="Scan QR">
                <span class="material-symbols-outlined">qr_code_scanner</span>
              </button>
              <button id="btn-join-room" style="flex:1; background:#72BF78; color:#121216; font-weight:bold; padding:12px; border-radius:6px; border:none; cursor:pointer;">
                Bergabung
              </button>
            </div>
          </div>
        </div>
      `;

      const joinBtn = document.getElementById("btn-join-room") as HTMLButtonElement;
      const codeInput = document.getElementById("join-room-code") as HTMLInputElement;

      joinBtn?.addEventListener("click", async () => {
        const code = codeInput?.value?.trim().toUpperCase();
        if (!code) {
          alert("Masukkan kode ruangan terlebih dahulu!");
          return;
        }

        joinBtn.disabled = true;
        joinBtn.textContent = "Menghubungkan...";

        try {
          // Ambil daftar ruangan yang aktif di server
          const rooms = await client.getAvailableRooms("game_room");
          console.log("Daftar Room Aktif:", rooms);

          let targetRoomId = null;

          // 1. Cari berdasarkan metadata roomCode
          const foundByMeta = rooms.find(r => r.metadata && r.metadata.roomCode && r.metadata.roomCode.toUpperCase() === code);
          if (foundByMeta) {
            targetRoomId = foundByMeta.roomId;
          } 
          // 2. Jika tidak ketemu di metadata tapi ada ruangan aktif, langsung ambil ruangan pertama (Sangat aman untuk testing lokal 1 PC)
          else if (rooms.length > 0) {
            console.warn("Menggunakan room aktif pertama yang tersedia di server.");
            targetRoomId = rooms[0].roomId;
          }

          if (targetRoomId) {
            const room = await client.joinById(targetRoomId, { name: profile.username });
            onRoomJoined(room);
          } else {
            // 3. Cadangan Terakhir: Coba join langsung menggunakan string kode sebagai ID/Nama room
            const room = await client.join("game_room", { roomCode: code, name: profile.username });
            onRoomJoined(room);
          }
        } catch (err: any) {
          console.error("Gagal join:", err);
          alert(`Gagal bergabung: Ruangan dengan kode "${code}" tidak ditemukan di server.`);
          joinBtn.disabled = false;
          joinBtn.textContent = "Bergabung";
        }
      });
    },
    unmount() {}
  };
}