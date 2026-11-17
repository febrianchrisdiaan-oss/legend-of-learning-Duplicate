// client/src/main.ts
import Phaser from "phaser";
import { Client } from "colyseus.js";
import { ensureAuthenticated } from "./services/authBridge";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { GameScene } from "./scenes/GameScene";
import { setPendingRoom } from "./core/gameBridge";
import { createClient } from '@supabase/supabase-js';

// Konfigurasi Supabase
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "YOUR_SUPABASE_ANON_KEY";
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let activeRoom: any = null;
let gameInstance: Phaser.Game | null = null; 

function startPhaser(room: any): void {
  setPendingRoom(room);

  const lobbyBgm = document.getElementById("bgm-lobby") as HTMLAudioElement;
  if (lobbyBgm) {
    lobbyBgm.pause();
    lobbyBgm.currentTime = 0; 
  }

  document.getElementById("fantasy-bg-layer")?.classList.add("hidden");
  document.getElementById("lobby-ui")?.classList.add("hidden");
  document.getElementById("waiting-room-ui")?.classList.add("hidden");
  document.getElementById("host-monitor-ui")?.classList.add("hidden");
  
  const gameContainer = document.getElementById("game-container");
  const gameUiLayer = document.getElementById("game-ui-layer");
  
  if (gameContainer) gameContainer.style.display = "block";
  if (gameUiLayer) gameUiLayer.classList.remove("hidden");

  if (gameInstance) {
    gameInstance.destroy(true);
    gameInstance = null;
  }

  gameInstance = new Phaser.Game({
    type: Phaser.AUTO,
    width: "100%",
    height: "100%",
    parent: "game-container",
    pixelArt: true,
    physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, PreloadScene, GameScene],
  });
}

// ====================================================================
// FUNGSI: MENYIMPAN RIWAYAT PERMAINAN KE SUPABASE (STATISTIK)
// ====================================================================
async function savePlayerMatchResult(room: any, rankings: any[]) {
  try {
    const myResult = rankings.find((r) => r.sessionId === room.sessionId);
    if (!myResult) return; 

    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) return;

    const userId = session.user.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('total_games, highest_score, correct_answers, wrong_answers')
      .eq('id', userId)
      .single();

    if (profile) {
      const newTotalGames = (profile.total_games || 0) + 1;
      const newHighestScore = Math.max((profile.highest_score || 0), Math.round(myResult.score || 0));
      const newCorrect = (profile.correct_answers || 0) + (myResult.correctAnswers || 0);
      const newWrong = (profile.wrong_answers || 0) + (myResult.wrongAnswers || 0);

      await supabase
        .from('profiles')
        .update({
          total_games: newTotalGames,
          highest_score: newHighestScore,
          correct_answers: newCorrect,
          wrong_answers: newWrong,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
        
      console.log("✅ Riwayat permainan & statistik berhasil disimpan ke Supabase!");
    }

  } catch (error) {
    console.error("Gagal menyimpan riwayat permainan:", error);
  }
}

function showLeaderboard(rankings: any[]) {
  if (gameInstance) {
    gameInstance.destroy(true);
    gameInstance = null;
  }

  const gameContainer = document.getElementById("game-container");
  const gameUiLayer = document.getElementById("game-ui-layer");
  if (gameContainer) gameContainer.style.display = "none";
  if (gameUiLayer) gameUiLayer.classList.add("hidden");

  document.getElementById("host-monitor-ui")?.classList.add("hidden");
  document.getElementById("waiting-room-ui")?.classList.add("hidden");
  document.getElementById("lobby-ui")?.classList.add("hidden");
  document.getElementById("login-ui")?.classList.add("hidden");
  document.getElementById("host-dashboard-ui")?.classList.add("hidden");

  document.getElementById("fantasy-bg-layer")?.classList.remove("hidden");

  const leaderboardOverlay = document.getElementById("leaderboard-overlay");
  const leaderboardList = document.getElementById("leaderboard-list");
  
  if (leaderboardList) {
    leaderboardList.innerHTML = "";
    rankings.forEach((r, idx) => {
      const item = document.createElement("div");
      item.className = "flex justify-between items-center p-3 bg-[#121216] rounded border border-[#333] text-xs mb-2";

      const nameEl = document.createElement("span");
      nameEl.className = "text-accent font-bold";
      nameEl.textContent = `#${r.rank || idx + 1} ${r.name || "Kadet"}`;

      const right = document.createElement("div");
      right.className = "text-right flex flex-col items-end";

      const s1 = document.createElement("div");
      s1.className = "text-primary font-bold";
      s1.textContent = `Skor: ${Math.round(r.score || 0)} (✓${r.correctAnswers || 0} ✗${r.wrongAnswers || 0})`;

      const s2 = document.createElement("div");
      s2.className = "text-[9px] text-blue-300 mt-1";
      s2.textContent = `⚡ Rata-rata: ${(r.averageResponseTime || 0).toFixed(1)} dtk/soal`;

      right.append(s1, s2);
      item.append(nameEl, right);
      leaderboardList.appendChild(item);
    });
  }

  if (leaderboardOverlay) {
    leaderboardOverlay.classList.remove("hidden");
  }
}

function parseCustomQuestions(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.split("|").map((s) => s.trim()))
    .filter((p) => p.length >= 5 && p[0] && p[1])
    .map(([question, correct, wrong1, wrong2, wrong3]) => ({ question, correct, wrong1, wrong2, wrong3 }));
}

function initProfileSystem(supabaseClient: any) {
  const profileModal = document.getElementById("profile-modal");
  const btnOpenProfile = document.getElementById("btn-open-profile");
  const btnCloseProfile = document.getElementById("btn-close-profile");
  const btnSaveProfile = document.getElementById("btn-save-profile");

  const inputUsername = document.getElementById("profile-username") as HTMLInputElement;
  const inputSchool = document.getElementById("profile-school") as HTMLInputElement;
  const inputClass = document.getElementById("profile-class") as HTMLInputElement;
  const selectGender = document.getElementById("profile-gender") as HTMLSelectElement;
  const selectHair = document.getElementById("profile-hair") as HTMLSelectElement;

  const statTotalGames = document.getElementById("stat-total-games");
  const statHighestScore = document.getElementById("stat-highest-score");
  const statAccuracy = document.getElementById("stat-accuracy");

  if (!btnOpenProfile) return;

  let currentUserId: string | null = null;

  const loadProfileFromSupabase = async () => {
    try {
      if (!supabaseClient) return;
      
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session || !session.user) return;

      currentUserId = session.user.id;

      const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUserId)
        .single();

      if (error) {
        console.warn("Profil belum ada atau gagal dimuat:", error.message);
        return;
      }

      if (data) {
        if (inputUsername) inputUsername.value = data.username || "";
        if (inputSchool) inputSchool.value = data.school || "";
        if (inputClass) inputClass.value = data.class_name || "";
        if (selectGender) selectGender.value = data.gender || "";
        if (selectHair) selectHair.value = data.hair_style || "base";

        localStorage.setItem("zigma_hair_style", data.hair_style || "base");

        if (statTotalGames) statTotalGames.textContent = (data.total_games || 0).toString();
        if (statHighestScore) statHighestScore.textContent = Math.round(data.highest_score || 0).toString();
        
        const correct = data.correct_answers || 0;
        const wrong = data.wrong_answers || 0;
        const totalAnswers = correct + wrong;
        const accuracy = totalAnswers > 0 ? Math.round((correct / totalAnswers) * 100) : 0;
        if (statAccuracy) statAccuracy.textContent = `${accuracy}%`;
      }
    } catch (err) {
      console.error("Terjadi kesalahan saat mengambil profil:", err);
    }
  };

  btnOpenProfile.addEventListener("click", () => {
    profileModal?.classList.remove("hidden");
    loadProfileFromSupabase();
  });

  btnCloseProfile?.addEventListener("click", () => {
    profileModal?.classList.add("hidden");
  });

  btnSaveProfile?.addEventListener("click", async () => {
    if (!currentUserId || !supabaseClient) {
      alert("Sesi pengguna tidak ditemukan. Silakan muat ulang halaman.");
      return;
    }

    const chosenHair = selectHair?.value || "base";
    localStorage.setItem("zigma_hair_style", chosenHair);

    btnSaveProfile.textContent = "Menyimpan...";
    try {
      const { error } = await supabaseClient
        .from('profiles')
        .update({
          username: inputUsername.value.trim(),
          school: inputSchool.value.trim(),
          class_name: inputClass.value.trim(),
          gender: selectGender.value,
          hair_style: chosenHair,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentUserId);

      if (error) throw error;

      const lobbyPlayerName = document.getElementById("lobby-player-name");
      if (lobbyPlayerName && inputUsername.value.trim()) {
        lobbyPlayerName.textContent = inputUsername.value.trim();
      }

      alert("Profil berhasil disimpan!");
      profileModal?.classList.add("hidden");
    } catch (err: any) {
      console.error("Gagal menyimpan profil:", err);
      alert("Gagal menyimpan profil: " + (err.message || "Kesalahan tidak diketahui"));
    } finally {
      btnSaveProfile.textContent = "Simpan Perubahan";
    }
  });
}

function setupAudioSettings() {
  const modal = document.getElementById("settings-modal");
  const btnOpen = document.getElementById("btn-open-settings");
  const btnClose = document.getElementById("btn-close-settings");
  
  const selectTheme = document.getElementById("select-audio-theme") as HTMLSelectElement;
  const rangeBgm = document.getElementById("range-bgm") as HTMLInputElement;
  const rangeSfx = document.getElementById("range-sfx") as HTMLInputElement;
  const valBgm = document.getElementById("val-bgm")!;
  const valSfx = document.getElementById("val-sfx")!;
  const lobbyBgm = document.getElementById("bgm-lobby") as HTMLAudioElement;
  const clickSfx = document.getElementById("sfx-click") as HTMLAudioElement;

  const savedTheme = localStorage.getItem("zigma_audio_theme") ?? "fantasy-rpg";
  const savedBgm = localStorage.getItem("zigma_bgm_vol") ?? "0.3";
  const savedSfx = localStorage.getItem("zigma_sfx_vol") ?? "0.5";

  if (selectTheme) selectTheme.value = savedTheme;
  if (rangeBgm) rangeBgm.value = (parseFloat(savedBgm) * 100).toString();
  if (rangeSfx) rangeSfx.value = (parseFloat(savedSfx) * 100).toString();
  if (valBgm) valBgm.textContent = `${rangeBgm?.value ?? 30}%`;
  if (valSfx) valSfx.textContent = `${rangeSfx?.value ?? 50}%`;

  if (lobbyBgm) lobbyBgm.volume = parseFloat(savedBgm);

  const updateAudioThemeSources = (themeName: string) => {
    if (lobbyBgm && clickSfx) {
      lobbyBgm.src = `/assets/audio/themes/${themeName}/lobby.mp3`;
      clickSfx.src = `/assets/audio/themes/${themeName}/click.mp3`;
      lobbyBgm.load();
      clickSfx.load();
    }
  };

  btnOpen?.addEventListener("click", () => modal?.classList.remove("hidden"));
  btnClose?.addEventListener("click", () => modal?.classList.add("hidden"));

  selectTheme?.addEventListener("change", () => {
    const chosenTheme = selectTheme.value;
    localStorage.setItem("zigma_audio_theme", chosenTheme);
    updateAudioThemeSources(chosenTheme);
    if (lobbyBgm && !lobbyBgm.paused) {
      lobbyBgm.play().catch(e => console.log("Gagal memutar ulang BGM", e));
    }
  });

  rangeBgm?.addEventListener("input", () => {
    const vol = parseInt(rangeBgm.value) / 100;
    valBgm.textContent = `${rangeBgm.value}%`;
    if (lobbyBgm) lobbyBgm.volume = vol;
    localStorage.setItem("zigma_bgm_vol", vol.toString());
  });

  rangeSfx?.addEventListener("input", () => {
    const vol = parseInt(rangeSfx.value) / 100;
    valSfx.textContent = `${rangeSfx.value}%`;
    localStorage.setItem("zigma_sfx_vol", vol.toString());
  });
}

// ====================================================================
// FUNGSI: MANAJEMEN BANK SOAL GURU (DISIMPAN DI LOKAL BROWSER)
// ====================================================================
function initQuestionBankLogic() {
  const savedBanksSelect = document.getElementById("host-saved-banks") as HTMLSelectElement;
  const btnSaveBank = document.getElementById("btn-save-bank");
  const btnLoadBank = document.getElementById("btn-load-bank");
  const btnDeleteBank = document.getElementById("btn-delete-bank");
  const hostQuestionsArea = document.getElementById("host-questions") as HTMLTextAreaElement;

  if (!savedBanksSelect || !btnSaveBank) return;

  // Fungsi untuk memuat daftar nama bank soal ke dalam dropdown
  const loadBanksToDropdown = () => {
    const banks = JSON.parse(localStorage.getItem("zigma_question_banks") || "{}");
    savedBanksSelect.innerHTML = '<option value="">-- Pilih Bank Soal --</option>';
    
    for (const bankName in banks) {
      const opt = document.createElement("option");
      opt.value = bankName;
      opt.textContent = bankName;
      savedBanksSelect.appendChild(opt);
    }
  };

  // Muat dropdown saat pertama kali dipanggil
  loadBanksToDropdown();

  // Tombol: Simpan Soal Saat Ini
  btnSaveBank.addEventListener("click", () => {
    const currentQuestions = hostQuestionsArea.value.trim();
    if (!currentQuestions) {
      alert("Kotak soal masih kosong! Ketik atau paste soalmu dulu sebelum menyimpan.");
      return;
    }
    
    const bankName = prompt("Masukkan nama untuk kumpulan soal ini:\n(Contoh: Matematika Kelas 8 - Bab Aljabar)");
    if (bankName && bankName.trim()) {
      const banks = JSON.parse(localStorage.getItem("zigma_question_banks") || "{}");
      banks[bankName.trim()] = currentQuestions;
      
      localStorage.setItem("zigma_question_banks", JSON.stringify(banks));
      loadBanksToDropdown();
      savedBanksSelect.value = bankName.trim(); // Langsung pilih bank yang baru dibuat
      alert(`✅ Bank soal "${bankName.trim()}" berhasil disimpan!`);
    }
  });

  // Tombol: Muat Soal
  btnLoadBank?.addEventListener("click", () => {
    const selectedBank = savedBanksSelect.value;
    if (!selectedBank) {
      alert("Pilih bank soal dari dropdown terlebih dahulu!");
      return;
    }
    
    const banks = JSON.parse(localStorage.getItem("zigma_question_banks") || "{}");
    if (banks[selectedBank]) {
      hostQuestionsArea.value = banks[selectedBank];
      
      // Berikan efek visual kedip ringan untuk menandakan soal telah dimuat
      hostQuestionsArea.style.borderColor = "#72BF78";
      setTimeout(() => hostQuestionsArea.style.borderColor = "#333", 500);
    }
  });

  // Tombol: Hapus Soal
  btnDeleteBank?.addEventListener("click", () => {
    const selectedBank = savedBanksSelect.value;
    if (!selectedBank) {
      alert("Pilih bank soal yang ingin dihapus dari dropdown!");
      return;
    }
    
    if (confirm(`Apakah Anda yakin ingin menghapus bank soal permanen:\n"${selectedBank}"?`)) {
      const banks = JSON.parse(localStorage.getItem("zigma_question_banks") || "{}");
      delete banks[selectedBank];
      
      localStorage.setItem("zigma_question_banks", JSON.stringify(banks));
      loadBanksToDropdown();
      hostQuestionsArea.value = ""; // Bersihkan layar
      alert(`🗑️ Bank soal "${selectedBank}" telah dihapus.`);
    }
  });
}

async function main(): Promise<void> {
  const profile = await ensureAuthenticated();
  const client = new Client(import.meta.env.VITE_SERVER_URL ?? "ws://localhost:2567");

  initProfileSystem(supabase);
  setupAudioSettings();
  initQuestionBankLogic();

  const loginUI = document.getElementById("login-ui")!;
  const lobbyUI = document.getElementById("lobby-ui")!;
  const hostDashboardUI = document.getElementById("host-dashboard-ui")!;
  const hostMonitorUI = document.getElementById("host-monitor-ui")!;
  const waitingRoomUI = document.getElementById("waiting-room-ui")!;
  const playerNameSpan = document.getElementById("lobby-player-name")!;

  const savedToken = sessionStorage.getItem("zigma_reconnectionToken");
  const isHost = sessionStorage.getItem("zigma_isHost") === "true";

  if (savedToken) {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      activeRoom = await (client as any).reconnect(savedToken);
      console.log("Berhasil memulihkan sesi dari refresh!");

      loginUI.classList.add("hidden");
      
      if (isHost) {
        hostMonitorUI.classList.remove("hidden");
        initHostMonitorLogic(activeRoom);
        
        activeRoom.onMessage("gameEnded", (data: { rankings: any[] }) => {
          showLeaderboard(data.rankings);
          sessionStorage.clear();
        });
      } else {
        waitingRoomUI.classList.add("hidden");
        startPhaser(activeRoom);
        
        activeRoom.onMessage("gameEnded", (data: { rankings: any[] }) => {
          showLeaderboard(data.rankings);
          savePlayerMatchResult(activeRoom, data.rankings);
          sessionStorage.clear();
        });
      }
      return; 
    } catch (err) {
      console.warn("Gagal memulihkan sesi, membersihkan storage:", err);
      sessionStorage.removeItem("zigma_reconnectionToken");
      sessionStorage.removeItem("zigma_isHost");
    }
  }

  loginUI.classList.add("hidden");
  playerNameSpan.textContent = profile.username || "Kadet";
  lobbyUI.classList.remove("hidden");

  document.getElementById("back-to-menu-btn")?.addEventListener("click", () => {
    sessionStorage.clear();
    window.location.reload();
  });

  document.getElementById("btn-goto-host")?.addEventListener("click", () => {
    lobbyUI.classList.add("hidden");
    hostDashboardUI.classList.remove("hidden");
  });

  document.getElementById("btn-host-cancel")?.addEventListener("click", () => {
    hostDashboardUI.classList.add("hidden");
    lobbyUI.classList.remove("hidden");
  });

  const hostModeSelect = document.getElementById("host-mode") as HTMLSelectElement;
  hostModeSelect.addEventListener("change", () => {
    document.getElementById("host-custom-panel")!.classList.toggle("hidden", hostModeSelect.value !== "custom");
  });

  const getPlayerHairStyle = () => {
    const selectHair = document.getElementById("profile-hair") as HTMLSelectElement;
    return selectHair?.value || localStorage.getItem("zigma_hair_style") || "base";
  };

  document.getElementById("btn-host-create")?.addEventListener("click", async () => {
    const btnCreate = document.getElementById("btn-host-create") as HTMLButtonElement;
    btnCreate.disabled = true;
    btnCreate.textContent = "Membuat Sesi...";

    const hostDifficultySelect = document.getElementById("host-difficulty") as HTMLSelectElement;

    try {
      const customQuestionsData = parseCustomQuestions(
        (document.getElementById("host-questions") as HTMLTextAreaElement).value
      );

      if (hostModeSelect.value === "custom" && customQuestionsData.length === 0) {
        alert("Mode custom butuh minimal 1 soal. Format: Tanya | Benar | S1 | S2 | S3");
        btnCreate.disabled = false;
        btnCreate.textContent = "Buat Sesi";
        return;
      }

      activeRoom = await client.create("game_room", {
        name: profile.username,
        hairStyle: getPlayerHairStyle(),
        isHost: true,
        difficulty: hostDifficultySelect ? hostDifficultySelect.value : "easy",
        mode: hostModeSelect.value,
        customEnemies: Number((document.getElementById("host-enemies") as HTMLInputElement).value) || 25,
        customHp: Number((document.getElementById("host-hp") as HTMLInputElement).value) || 2,
        customQuestionsData,
        allowPlayerDeath: (document.getElementById("host-player-death") as HTMLSelectElement)?.value === "true"
      });

      sessionStorage.setItem("zigma_reconnectionToken", activeRoom.reconnectionToken);
      sessionStorage.setItem("zigma_isHost", "true");

      hostDashboardUI.classList.add("hidden");
      hostMonitorUI.classList.remove("hidden");
      initHostMonitorLogic(activeRoom);

      activeRoom.onMessage("gameEnded", (data: { rankings: any[] }) => {
        showLeaderboard(data.rankings);
      });

    } catch (err: any) {
      console.error(err);
      alert("Gagal membuat sesi: " + err.message);
      btnCreate.disabled = false;
      btnCreate.textContent = "Buat Sesi";
    }
  });

  document.getElementById("btn-join-room")?.addEventListener("click", async () => {
    const inputCode = document.getElementById("join-room-code") as HTMLInputElement;
    const code = inputCode?.value?.trim().toUpperCase();
    const btnJoin = document.getElementById("btn-join-room") as HTMLButtonElement;

    if (!code) {
      alert("Masukkan kode kelas terlebih dahulu!");
      return;
    }

    btnJoin.disabled = true;
    btnJoin.textContent = "Mencari Kelas...";

    try {
      const rooms = await client.getAvailableRooms("game_room");
      let targetRoom = rooms.find(r => r.metadata && r.metadata.roomCode === code);

      if (targetRoom) {
        activeRoom = await client.joinById(targetRoom.roomId, { 
          name: profile.username,
          hairStyle: getPlayerHairStyle() 
        });

        sessionStorage.setItem("zigma_reconnectionToken", activeRoom.reconnectionToken);
        sessionStorage.setItem("zigma_isHost", "false");

        lobbyUI.classList.add("hidden");
        waitingRoomUI.classList.remove("hidden");

        // ====================================================================
        // FITUR CHAT EMOJI DI RUANG TUNGGU (LOBBY)
        // ====================================================================
        document.querySelectorAll('#waiting-room-ui .emoji-btn').forEach((btn) => {
          const newBtn = btn.cloneNode(true) as HTMLButtonElement;
          btn.parentNode?.replaceChild(newBtn, btn);

          newBtn.addEventListener('click', () => {
            const emoji = newBtn.getAttribute('data-emoji');
            if (activeRoom && emoji) { 
              activeRoom.send("sendEmoji", { emoji });
              
              newBtn.style.transform = "scale(0.8)";
              setTimeout(() => newBtn.style.transform = "scale(1)", 150);
            }
          });
        });

        activeRoom.onMessage("playerEmoji", (data: { sessionId: string; emoji: string }) => {
          const container = document.getElementById('floating-emoji-container');
          if (!container) return;

          const el = document.createElement('div');
          el.textContent = data.emoji;
          el.className = 'absolute text-4xl pointer-events-none drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]';

          el.style.left = `${10 + Math.random() * 80}%`;
          el.style.bottom = '-50px';
          container.appendChild(el);

          el.animate([
            { transform: 'translateY(0) scale(0.5)', opacity: 1 },
            { transform: `translateY(-${window.innerHeight + 100}px) scale(1.5) rotate(${Math.random() * 40 - 20}deg)`, opacity: 0 }
          ], {
            duration: 2500 + Math.random() * 1000,
            easing: 'ease-out'
          }).onfinish = () => el.remove();
        });
        // ====================================================================

        let started = false;
        const begin = (): void => {
          if (started) return;
          started = true;
          startPhaser(activeRoom);
        };

        activeRoom.onMessage("gameStarted", begin);
        activeRoom.onStateChange.once(() => {
          if (activeRoom.state.isGameStarted) begin();
        });

        activeRoom.onMessage("gameEnded", (data: { rankings: any[] }) => {
          showLeaderboard(data.rankings);
          savePlayerMatchResult(activeRoom, data.rankings);
        });

      } else {
        alert(`Kelas dengan kode "${code}" tidak ditemukan!`);
        btnJoin.disabled = false;
        btnJoin.textContent = "Bergabung";
      }
    } catch (err: any) {
      console.error(err);
      alert("Gagal bergabung: " + err.message);
      btnJoin.disabled = false;
      btnJoin.textContent = "Bergabung";
    }
  });

  let activeScanner: any = null;
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const btnScan = target.closest("#btn-scan-qr");
    const btnClose = target.closest("#btn-close-scanner");
    const qrOverlay = document.getElementById("qr-scanner-overlay");

    if (btnScan) {
      qrOverlay?.classList.remove("hidden");
      const Win = window as any;
      if (Win.Html5QrcodeScanner) {
        if (activeScanner) activeScanner.clear().catch(() => {});
        activeScanner = new Win.Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
        activeScanner.render((decodedText: string) => {
          activeScanner.clear().catch(() => {});
          activeScanner = null;
          qrOverlay?.classList.add("hidden");
          const codeInput = document.getElementById("join-room-code") as HTMLInputElement;
          if (codeInput) codeInput.value = decodedText;
          document.getElementById("btn-join-room")?.click();
        }, () => {});
      }
    }

    if (btnClose) {
      if (activeScanner) {
        activeScanner.clear().catch(() => {});
        activeScanner = null;
      }
      qrOverlay?.classList.add("hidden");
    }
  });

  document.getElementById("global-fullscreen-btn")?.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error("Gagal mengaktifkan mode layar penuh:", err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  });
}

function initHostMonitorLogic(room: any) {
  const codeEl = document.getElementById("hm-room-code")!;
  const listEl = document.getElementById("hm-player-list")!;
  const mapEl = document.getElementById("hm-live-map")!;
  const startBtn = document.getElementById("hm-start-btn") as HTMLButtonElement;
  const endBtn = document.getElementById("hm-end-btn") as HTMLButtonElement;
  const hostMonitorUI = document.getElementById("host-monitor-ui")!;

  room.onStateChange.once(() => {
    if (room.state.roomCode) {
      codeEl.textContent = room.state.roomCode;
      const qrContainer = document.getElementById("hm-qrcode")!;
      qrContainer.innerHTML = "";
      qrContainer.classList.remove("hidden");
      
      const Win = window as any;
      if (Win.QRCode) {
        new Win.QRCode(qrContainer, {
          text: room.state.roomCode.toString(),
          width: 120, height: 120,
        });
      }
    }

    if (mapEl && room.state.difficulty) {
      const diff = room.state.difficulty.toLowerCase();
      let mapBgUrl = "/assets/maps/mapeasy.png"; 
      
      if (diff === "medium") {
        mapBgUrl = "/assets/maps/mapmedium.png";
      } else if (diff === "hard") {
        mapBgUrl = "/assets/maps/maphard.png";
      }

      mapEl.style.backgroundImage = `url('${mapBgUrl}')`;
      mapEl.style.backgroundSize = "cover";
      mapEl.style.backgroundPosition = "center";
    }
  });

  const radarMarkers = new Map<string, HTMLElement>();

  const updateRadarAndList = () => {
    listEl.innerHTML = "";
    if (room.state && room.state.players) {
      room.state.players.forEach((p: any) => {
        const li = document.createElement("li");
        li.className = "flex justify-between items-center p-2 bg-[#222236] rounded text-xs mb-1 border border-[#333]";

        const nameEl = document.createElement("span");
        nameEl.textContent = p.name || "Kadet";

        const scoreEl = document.createElement("span");
        scoreEl.className = "text-primary font-bold";
        scoreEl.textContent = `Skor: ${Math.round(p.score || 0)}`;

        li.append(nameEl, scoreEl);
        listEl.appendChild(li);
      });

      if (room.state.players.size === 0) {
        const empty = document.createElement("li");
        empty.style.cssText = "color:#666; font-size:11px; text-align:center; padding:10px;";
        empty.textContent = "Menunggu kadet bergabung...";
        listEl.appendChild(empty);
      }
    }

    if (!mapEl) return;

    const mapWidth = mapEl.clientWidth || 380;
    const mapHeight = mapEl.clientHeight || 380;
    const WORLD_WIDTH = 2000; 
    const WORLD_HEIGHT = 2000;

    if (room.state && room.state.players) {
      const activePlayerIds = new Set<string>();

      room.state.players.forEach((p: any, sessionId: string) => {
        activePlayerIds.add(sessionId);
        let container = radarMarkers.get(sessionId);

        if (!container) {
          container = document.createElement("div");
          container.className = "absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none transition-all duration-75";
          container.style.zIndex = "20";

          const nameTag = document.createElement("span");
          nameTag.className = "text-[8px] bg-black/90 text-accent px-1 py-0.5 rounded whitespace-nowrap mb-0.5 border border-black pixel-text-outline";
          nameTag.textContent = p.name || "Kadet";

          const dot = document.createElement("div");
          dot.className = "w-3 h-3 bg-accent rounded-full border border-black shadow-[0_0_8px_#FEFF9F]";

          container.appendChild(nameTag);
          container.appendChild(dot);
          mapEl.appendChild(container);

          radarMarkers.set(sessionId, container);
        } else {
          const nameTag = container.querySelector("span");
          if (nameTag && nameTag.textContent !== p.name) {
            nameTag.textContent = p.name || "Kadet";
          }
        }

        const rawX = p.x ?? 0;
        const rawY = p.y ?? 0;

        const percentX = Math.max(0, Math.min(1, rawX / WORLD_WIDTH));
        const percentY = Math.max(0, Math.min(1, rawY / WORLD_HEIGHT));

        const posX = percentX * mapWidth;
        const posY = percentY * mapHeight;

        container.style.left = `${posX}px`;
        container.style.top = `${posY}px`;
      });

      for (const [id, el] of radarMarkers.entries()) {
        if (!activePlayerIds.has(id)) {
          el.remove();
          radarMarkers.delete(id);
        }
      }
    }
  };

  room.state.players.onAdd((player: any) => {
    updateRadarAndList();
    player.onChange(() => {
      updateRadarAndList();
    });
  });

  room.state.players.onRemove(() => {
    updateRadarAndList();
  });

  const radarInterval = setInterval(() => {
    if (room && room.state && room.state.players) {
      updateRadarAndList();
    }
  }, 100);

  startBtn.onclick = () => {
    room.send("startGame");
    startBtn.classList.add("hidden");
    endBtn.classList.remove("hidden");
  };

  endBtn.onclick = () => {
    if (confirm("Apakah Anda yakin ingin mengakhiri permainan sekarang?")) {
      try {
        room.send("forceEndGame");
      } catch (err) {
        console.error("Gagal mengirim perintah forceEndGame:", err);
      }

      clearInterval(radarInterval);
      hostMonitorUI.classList.add("hidden");
    }
  };
}

main().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<p style="color:red; padding:20px;">Gagal memuat sistem: ${e.message}</p>`;
});