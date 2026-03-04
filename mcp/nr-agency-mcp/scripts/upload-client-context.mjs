/**
 * Upload client context files from Marketing AI Agents workspace to Supabase client_documents.
 *
 * Maps workspace client folders → Supabase clients (fuzzy name match).
 * Skips: empty files, credentials, node_modules, README.
 * Upserts: same client + doc_type + title → updates content.
 *
 * Usage: node scripts/upload-client-context.mjs [--dry-run]
 */

import { createClient } from "@supabase/supabase-js";
import { readdir, readFile, stat } from "fs/promises";
import { join, basename } from "path";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://qsxgwmaranwsxnibkxbr.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const DRY_RUN = process.argv.includes("--dry-run");

const WORKSPACE = "/Users/isidor/ Marketing AI Agents/workspace/clients";

// Map file paths to doc_type
function classifyFile(relPath, filename) {
  if (filename === "profile.md") return "overview";
  if (relPath.includes("brand-market-research") || relPath.includes("market-research")) return "research";
  if (relPath.includes("voc-library") || relPath.includes("voc library") || relPath.includes("survey")) return "research";
  if (relPath.startsWith("context/konkurrenter") || relPath.startsWith("context/product-catalog")) return "research";
  if (relPath.startsWith("context/approved-copy")) return "brief";
  if (relPath.startsWith("context/email-marketing") || relPath.includes("email-flows")) return "strategy";
  if (relPath.startsWith("context/årshjul")) return "strategy";
  if (relPath.startsWith("context/audit")) return "report";
  if (relPath.startsWith("strategy/")) return "strategy";
  if (relPath.startsWith("history/performance-log")) return "history";
  if (relPath.startsWith("history/content-learnings")) return "history";
  if (relPath.startsWith("history/monthly-status")) return "history";
  if (relPath.includes("monthly-review")) return "report";
  if (relPath.includes("Strategi") || relPath.includes("strategi")) return "strategy";
  if (relPath.includes("Audit") || relPath.includes("audit")) return "report";
  if (relPath.startsWith("output/") || relPath.startsWith("documents/")) return "report";
  if (filename.includes("copy-profile")) return "brief";
  if (filename.includes("Lead-Gen") || filename.includes("Kampagner")) return "creative";
  if (filename.includes("Feasibility") || filename.includes("Research")) return "research";
  return "other";
}

// Build a readable title from filename
function makeTitle(relPath, filename) {
  // Remove .md extension
  let title = filename.replace(/\.md$/, "");
  // Clean up common prefixes
  title = title
    .replace(/^wonhundred-/, "")
    .replace(/^vinnys-/, "")
    .replace(/^flora-danica-/, "Flora Danica – ")
    .replace(/-/g, " ")
    .replace(/_/g, " ");
  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return title;
}

// Skip criteria
function shouldSkip(relPath, filename, size) {
  if (size === 0) return "empty";
  if (filename === "credentials.md") return "credentials";
  if (filename === "README.md") return "readme";
  if (relPath.includes("node_modules/")) return "node_modules";
  if (relPath.startsWith("presentations/")) return "presentations dir";
  if (relPath.startsWith("documents/node_modules")) return "node_modules";
  return null;
}

// Explicit folder → Supabase name mapping (no fuzzy matching)
const FOLDER_TO_CLIENT = {
  "Won Hundred": "Won Hundred",
  "adax": "Adax",
  "arctic-outdoor": "Arctic Outdoor",
  "bella-ballou": "Bella Ballou",
  "elou": "Elou",
  "flora-danica": "Flora Danica",
  "gastrotools": "Gastrotools DK",
  "i-love-beauty": "I Love Beauty",
  "kystfisken": "Kystfisken",
  "lemele": "Lemele",
  "mill-mortar": "Mill & Mortar",
  "neble-rohde": "Neble+Rohde",
  "nordic-weaving": "Nordic Weaving",
  "nuori": "Nuori",
  "rackbuddy": "RackBuddy",
  "saetter": "Sætter",
  "son-of-a-tailor": "Son of a Tailor",
  "spring-copenhagen": "Spring Copenhagen",
  "vetro": "Vetro",
  "vinnys": "VINNY's",
};

function matchClient(folderName, supabaseClients) {
  const targetName = FOLDER_TO_CLIENT[folderName];
  if (!targetName) return null;

  // Exact match first
  const exact = supabaseClients.find(c => c.name === targetName);
  if (exact) return exact;

  // Partial match (e.g. "Kystfisken" matches "Kystfisken ApS")
  const lower = targetName.toLowerCase();
  return supabaseClients.find(c => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase().split(" ")[0])) || null;
}

async function findMarkdownFiles(dir, basePath = "") {
  const files = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const sub = await findMarkdownFiles(join(dir, entry.name), relPath);
        files.push(...sub);
      } else if (entry.name.endsWith(".md")) {
        const filePath = join(dir, entry.name);
        const s = await stat(filePath);
        files.push({ relPath, filename: entry.name, filePath, size: s.size });
      }
    }
  } catch (e) {
    // Skip unreadable dirs
  }
  return files;
}

async function main() {
  // Get all Supabase clients
  const { data: supabaseClients } = await sb.from("clients").select("id, name").order("name");
  console.log(`Found ${supabaseClients.length} clients in Supabase\n`);

  // Get all client folders
  const clientDirs = await readdir(WORKSPACE, { withFileTypes: true });

  let uploaded = 0;
  let skipped = 0;
  let noMatch = 0;
  const unmatchedClients = new Set();

  for (const dir of clientDirs) {
    if (!dir.isDirectory()) continue;
    if (dir.name.startsWith("_")) continue; // Skip templates

    const clientFolder = dir.name;
    const client = matchClient(clientFolder, supabaseClients);

    if (!client) {
      unmatchedClients.add(clientFolder);
      continue;
    }

    const files = await findMarkdownFiles(join(WORKSPACE, clientFolder));

    for (const { relPath, filename, filePath, size } of files) {
      const skipReason = shouldSkip(relPath, filename, size);
      if (skipReason) {
        skipped++;
        continue;
      }

      const docType = classifyFile(relPath, filename);
      const title = makeTitle(relPath, filename);
      const content = await readFile(filePath, "utf-8");

      if (DRY_RUN) {
        console.log(`[DRY] ${client.name} | ${docType} | ${title} (${(size/1024).toFixed(1)}KB)`);
        uploaded++;
        continue;
      }

      // Upsert: check existing
      const { data: existing } = await sb
        .from("client_documents")
        .select("id")
        .eq("client_id", client.id)
        .eq("doc_type", docType)
        .eq("title", title)
        .limit(1);

      if (existing?.length) {
        const { error } = await sb
          .from("client_documents")
          .update({ content, updated_at: new Date().toISOString(), created_by: "context-upload" })
          .eq("id", existing[0].id);

        if (error) {
          console.error(`  ERROR updating ${title}: ${error.message}`);
        } else {
          console.log(`  UPDATED: ${client.name} | ${docType} | ${title}`);
          uploaded++;
        }
      } else {
        const { error } = await sb
          .from("client_documents")
          .insert({
            client_id: client.id,
            doc_type: docType,
            title,
            content,
            created_by: "context-upload",
          });

        if (error) {
          console.error(`  ERROR inserting ${title}: ${error.message}`);
        } else {
          console.log(`  CREATED: ${client.name} | ${docType} | ${title}`);
          uploaded++;
        }
      }
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Skipped: ${skipped} (empty/credentials/node_modules)`);
  if (unmatchedClients.size) {
    console.log(`\nNo Supabase match for ${unmatchedClients.size} clients:`);
    for (const c of [...unmatchedClients].sort()) {
      console.log(`  - ${c}`);
    }
    console.log(`\nThese clients need to be created in Supabase first (via create_client tool or dashboard).`);
  }
}

main().catch(console.error);
