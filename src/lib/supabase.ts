import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleKey, getSupabaseUrl } from "./env";

let client: SupabaseClient | null = null;

/** Memoized service-role client. Throws if the key is missing (demo mode should gate this). */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  const key = getServiceRoleKey();
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — cannot create a live Supabase client");
  }
  client = createClient(getSupabaseUrl(), key, { auth: { persistSession: false } });
  return client;
}
