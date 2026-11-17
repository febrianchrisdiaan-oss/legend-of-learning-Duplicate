// client/src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export interface Profile {
  id: string;
  username: string;
  email: string | null;
  fullname: string | null;
  avatar_url: string | null;
  phone: string | null;
  organization: string | null;
  birthdate: string | null;
  language: string;
  role: "siswa" | "guru" | "admin";
  notifications: Record<string, unknown>;
  last_active: string;
  created_at: string;
  updated_at: string;
  favorite_quiz: unknown[];
  is_profile_public: boolean;
  is_blocked: boolean;
  blocked_at: string | null;
  nickname: string | null;
  country_id: number | null;
  state_id: number | null;
  city_id: number | null;
  deleted_at: string | null;
  grade: string | null;
  gender: "L" | "P" | null;
  admin_since: string | null;
}

export const USER_SESSION_KEY = "game_user_session";
export const USER_PROFILE_KEY = "game_user_profile";