/**
 * Upload N+R agency knowledge to Supabase under the Neble+Rohde client.
 * Includes: Full Funnel strategy, Brand Lifecycle, analysis frameworks, copy frameworks.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://qsxgwmaranwsxnibkxbr.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_KEY) { console.error("Missing SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const WORKSPACE = "/Users/isidor/ Marketing AI Agents";

function extractDocx(path) {
  // Write a small python script to extract docx content
  const pyScript = `
import docx, sys
doc = docx.Document(sys.argv[1])
for p in doc.paragraphs:
    print(p.text)
`;
  writeFileSync("/tmp/extract_docx.py", pyScript);
  return execSync(`python3 /tmp/extract_docx.py "${path}"`, { encoding: "utf-8", maxBuffer: 1024 * 1024 });
}

async function main() {
  // Get Neble+Rohde client ID
  const { data: clients } = await sb.from("clients").select("id, name").ilike("name", "%Neble%");
  if (!clients?.length) { console.error("Neble+Rohde not found"); process.exit(1); }
  const nrId = clients[0].id;
  console.log(`Uploading to: ${clients[0].name} (${nrId})\n`);

  // Extract docx files
  const fullFunnel = extractDocx(`${WORKSPACE}/docs/Neble og Rohde - Full Funnel Strategi.docx`);
  const brandLifecycle = extractDocx(`${WORKSPACE}/docs/The Brand Lifecycle.docx`);

  // Read agent frameworks
  const agentDir = `${WORKSPACE}/.claude/agents`;
  const agents = {
    "N+R Analyse Framework – Meta Ads": readFileSync(`${agentDir}/performance-analyst-meta.md`, "utf-8"),
    "N+R Analyse Framework – Google Ads": readFileSync(`${agentDir}/performance-analyst-google.md`, "utf-8"),
    "N+R Analyse Framework – Klaviyo": readFileSync(`${agentDir}/performance-analyst-klaviyo.md`, "utf-8"),
    "N+R Strategi Framework – Brand & Marketing": readFileSync(`${agentDir}/brand-marketing-strategist.md`, "utf-8"),
    "N+R Copy Framework – Email": readFileSync(`${agentDir}/email-copywriter.md`, "utf-8"),
    "N+R Copy Framework – Meta Ads": readFileSync(`${agentDir}/meta-ads-copywriter.md`, "utf-8"),
    "N+R Copy Framework – Google Ads": readFileSync(`${agentDir}/google-ads-copywriter.md`, "utf-8"),
    "N+R Research Framework – Brand & Market": readFileSync(`${agentDir}/brand-market-research.md`, "utf-8"),
  };

  // Read marketing theory docs (markdown)
  const docsDir = `${WORKSPACE}/docs`;
  const theoryDocs = {
    "Value Proposition Canvas": readFileSync(`${docsDir}/Value Proposition Canvas.md`, "utf-8"),
    "Cialdini's 7 Principper for Influence": readFileSync(`${docsDir}/Cialdini - 7 Principles of Influence.md`, "utf-8"),
    "Marketing Psychology & Mental Models": readFileSync(`${docsDir}/Marketing Psychology & Mental Models.md`, "utf-8"),
    "N+R Performance Analysis Methodology": readFileSync(`${docsDir}/Performance Analysis Methodology.md`, "utf-8"),
  };

  const docs = [
    { title: "N+R Full Funnel Strategi (FP → IM → IP → EC)", content: fullFunnel },
    { title: "The Brand Lifecycle (4 Stages)", content: brandLifecycle },
    ...Object.entries(agents).map(([title, content]) => ({ title, content })),
    ...Object.entries(theoryDocs).map(([title, content]) => ({ title, content })),
  ];

  let created = 0, updated = 0;

  for (const d of docs) {
    const { data: existing } = await sb.from("client_documents").select("id")
      .eq("client_id", nrId).eq("doc_type", "strategy").eq("title", d.title).limit(1);

    if (existing?.length) {
      const { error } = await sb.from("client_documents")
        .update({ content: d.content, updated_at: new Date().toISOString(), created_by: "agency-knowledge" })
        .eq("id", existing[0].id);
      if (error) console.error(`  ERROR: ${d.title}: ${error.message}`);
      else { console.log(`  UPDATED: ${d.title}`); updated++; }
    } else {
      const { error } = await sb.from("client_documents")
        .insert({ client_id: nrId, doc_type: "strategy", title: d.title, content: d.content, created_by: "agency-knowledge" });
      if (error) console.error(`  ERROR: ${d.title}: ${error.message}`);
      else { console.log(`  CREATED: ${d.title}`); created++; }
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Created: ${created}, Updated: ${updated}, Total: ${docs.length}`);
}

main().catch(console.error);
