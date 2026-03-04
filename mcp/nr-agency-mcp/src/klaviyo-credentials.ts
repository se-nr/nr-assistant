/**
 * Klaviyo credential resolution for NR Agency MCP
 *
 * Dual-read pattern: data_sources + Vault first, legacy clients.klaviyo_api_key fallback.
 * Adapted from neble-rohde-dashboard/src/lib/connectors/resolve-source.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveKlaviyoApiKey(
  sb: SupabaseClient,
  clientId: string,
): Promise<string> {
  // Try new architecture: data_sources + Supabase Vault
  const { data: source } = await sb
    .from("data_sources")
    .select("vault_secret_id")
    .eq("client_id", clientId)
    .eq("source_type", "klaviyo")
    .eq("is_active", true)
    .maybeSingle();

  if (source?.vault_secret_id) {
    const { data: secret } = await sb.rpc("get_decrypted_secret", {
      secret_id: source.vault_secret_id,
    });
    if (secret) {
      const creds = JSON.parse(secret as string) as { api_key: string };
      if (creds.api_key) return creds.api_key;
    }
  }

  // Legacy fallback: clients.klaviyo_api_key
  const { data: client } = await sb
    .from("clients")
    .select("klaviyo_api_key")
    .eq("id", clientId)
    .single();

  if (client?.klaviyo_api_key) return client.klaviyo_api_key as string;

  throw new Error("Ingen Klaviyo API key fundet");
}
