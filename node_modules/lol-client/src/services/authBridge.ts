// client/src/services/authBridge.ts
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/supabase";

export async function ensureAuthenticated(): Promise<Profile> {
  // 1. Cek apakah ada token di URL fragment (baru balik dari Auth)
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;

    // bersihkan token dari address bar
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // 2. Cek session yang sudah ada (baik baru di-set atau sudah ada sebelumnya)
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // 3. Belum login sama sekali → redirect ke website Auth
    const authUrl = import.meta.env.VITE_AUTH_URL;
    const redirectTo = encodeURIComponent(window.location.origin);
    window.location.href = `${authUrl}/login?redirect_to=${redirectTo}`;
    // redirect berjalan, hentikan eksekusi lebih lanjut
    return new Promise(() => {}); // never resolves, halaman akan pindah
  }

  // 4. Ambil data profile lengkap
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) throw new Error("Profil tidak ditemukan");
  return profile as Profile;
}