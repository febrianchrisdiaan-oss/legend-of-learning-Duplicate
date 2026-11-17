// client/src/pages/hostDashboardPage.ts
import { Client } from "colyseus.js";
import { Router } from "../core/Router";
import type { PageModule, PageContext } from "../core/PageManager";

export function createHostDashboardPage(
  client: Client,
  profile: { username: string },
  onRoomCreated: (room: any) => void
): PageModule {
  return {
    mount({ container }: PageContext) {
      container.innerHTML = `
        <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; font-family:sans-serif; background:#0a0a1a;">
          <div style="background:#1a1a2e; padding:28px; border-radius:12px; width:360px;">
            <h2 style="color:white; text-align:center; margin-bottom:20px;">Dashboard Guru</h2>

            <label style="color:#aaa; font-size:13px;">Mata Pelajaran</label>
            <select id="host-subject" style="width:100%; padding:8px; margin:6px 0 16px; border-radius:6px; background:#2a2a3e; color:white; border:1px solid #444;">
              <option value="math">Matematika</option>
              <option value="science">Sains</option>
            </select>

            <label style="color:#aaa; font-size:13px;">Mode Permainan</label>
            <select id="host-mode" style="width:100%; padding:8px; margin:6px 0 16px; border-radius:6px; background:#2a2a3e; color:white; border:1px solid #444;">
              <option value="default">Opsi 2: Template Default (Otomatis)</option>
              <option value="custom">Opsi 1: Custom (Atur Sendiri)</option>
            </select>

            <!-- PANEL CUSTOM (Hanya muncul jika Opsi 1 dipilih) -->
            <div id="custom-panel" style="display:none; background:#222236; padding:12px; border-radius:8px; margin-bottom:16px; border:1px solid #444;">
              <label style="color:#aaa; font-size:13px;">Jumlah Musuh di Peta</label>
              <input type="number" id="host-enemies" value="25" min="1" max="100" style="width:100%; padding:8px; margin:6px 0 12px; border-radius:6px; background:#333; color:white; border:none; box-sizing:border-box;">
              
              <label style="color:#aaa; font-size:13px;">Darah Musuh (HP)</label>
              <input type="number" id="host-hp" value="2" min="1" max="10" style="width:100%; padding:8px; margin:6px 0 12px; border-radius:6px; background:#333; color:white; border:none; box-sizing:border-box;">
              
              <label style="color:#aaa; font-size:13px;">Bank Soal Custom</label>
              <p style="font-size:11px; color:#888; margin:0 0 6px 0;">Format: <span style="color:#4ade80">Pertanyaan | Jawaban Benar | Salah 1 | Salah 2 | Salah 3</span></p>
              <textarea id="host-custom-q" placeholder="Contoh:&#10;1+1=? | 2 | 3 | 4 | 5&#10;Ibukota RI? | Jakarta | Bali | Solo | Medan" style="width:100%; height:100px; padding:8px; margin-bottom:6px; border-radius:6px; background:#333; color:white; border:none; box-sizing:border-box; resize:vertical; font-family:monospace; font-size:12px;"></textarea>
              <p style="font-size:11px; color:#facc15; margin:0; line-height:1.4;">*Pisahkan dengan garis lurus ( | ). Setiap baris baru = 1 soal baru.</p>
            </div>

            <button id="host-start-btn" style="width:100%; padding:12px; background:#4f46e5; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; margin-top:10px;">
              Buat Sesi Game
            </button>
          </div>
        </div>
      `;

      const subjectSelect = document.getElementById("host-subject") as HTMLSelectElement;
      const modeSelect = document.getElementById("host-mode") as HTMLSelectElement;
      const customPanel = document.getElementById("custom-panel") as HTMLDivElement;
      
      const enemiesInput = document.getElementById("host-enemies") as HTMLInputElement;
      const hpInput = document.getElementById("host-hp") as HTMLInputElement;
      const questionsInput = document.getElementById("host-questions") as HTMLInputElement;
      const startBtn = document.getElementById("host-start-btn") as HTMLButtonElement;

      // Logika untuk memunculkan atau menyembunyikan Panel Custom
      modeSelect.addEventListener("change", () => {
        if (modeSelect.value === "custom") {
          customPanel.style.display = "block";
        } else {
          customPanel.style.display = "none";
        }
      });

      startBtn.addEventListener("click", async () => {
        startBtn.disabled = true;
        startBtn.textContent = "Membuat sesi...";

        // 1. Baca dan Parse Soal Custom yang diketik guru
        let parsedCustomQuestions: any[] = [];
        if (modeSelect.value === "custom") {
          const customQInput = document.getElementById("host-custom-q") as HTMLTextAreaElement;
          const lines = customQInput.value.split("\n"); // Pisahkan per baris
          
          for (const line of lines) {
            if (line.trim() === "") continue;
            const parts = line.split("|").map(p => p.trim());
            
            // Pastikan formatnya lengkap (1 soal + 4 pilihan jawaban)
            if (parts.length >= 5) {
              parsedCustomQuestions.push({
                question: parts[0],
                correct: parts[1],
                wrong1: parts[2],
                wrong2: parts[3],
                wrong3: parts[4]
              });
            }
          }
        }

        // 2. Kirim data ke Server Colyseus
        const room = await client.joinOrCreate("game_room", {
          name: profile.username,
          isHost: true,
          subject: subjectSelect.value,
          mode: modeSelect.value, // "default" atau "custom"
          customEnemies: parseInt((document.getElementById("host-enemies") as HTMLInputElement).value),
          customHp: parseInt((document.getElementById("host-hp") as HTMLInputElement).value),
          customQuestionsData: parsedCustomQuestions // <-- Kirim Array Soal ke Server
        });

        onRoomCreated(room);
        Router.navigate("/host/monitor");
      });
    },
  };
}