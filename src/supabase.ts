import { createClient } from "@supabase/supabase-js";

export type GomokuSessionRecord = {
  outcome: "black_win" | "white_win" | "draw" | "abandoned";
  winner: "black" | "white" | null;
  move_count: number;
  board_size: number;
  duration_ms: number;
  started_at: string;
  finished_at: string;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

export function isSupabaseReady(): boolean {
  return Boolean(supabase);
}

export async function insertGomokuSession(record: GomokuSessionRecord): Promise<void> {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("gomoku_sessions").insert(record);

  if (error) {
    throw error;
  }
}
