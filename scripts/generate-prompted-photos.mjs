#!/usr/bin/env node

// Generates planmode registry entries from prompted.photos presets.ts
// Run: node scripts/generate-prompted-photos.mjs
//
// This script:
// 1. Parses presets.ts to get exact prompt text and image names
// 2. Generates/updates registry packages (metadata.json, planmode.yaml, prompt.md, versions/)
// 3. Updates src/data/packages.json and src/data/package-details.json
// 4. Adds {{location}} templating variables to all map prompts

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRESETS_PATH = join(ROOT, "..", "prompted.photos", "src", "presets.ts");

const now = "2026-02-17T10:00:00Z";
const baseImageUrl = "https://prompted.photos/img";

// ─── Parse presets.ts ───────────────────────────────────────────────────────

function parsePresets() {
  const src = readFileSync(PRESETS_PATH, "utf8");

  // Extract the PRESETS array content between the first [ and its matching ]
  const arrayStart = src.indexOf("export const PRESETS: Preset[] = [");
  if (arrayStart === -1) throw new Error("Could not find PRESETS array");

  const presets = [];
  // Match each object block: { id: "...", label: "...", category: "...", prompt: "...", exampleImage: "..." }
  const objectRegex = /\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*category:\s*"([^"]+)",\s*prompt:\s*([\s\S]*?),\s*exampleImage:\s*"([^"]+)",?\s*\}/g;

  let match;
  while ((match = objectRegex.exec(src)) !== null) {
    const [, id, label, category, rawPrompt, exampleImage] = match;

    // Parse the prompt value (may be a single string or multi-line template literal)
    let prompt;
    const trimmed = rawPrompt.trim();
    if (trimmed.startsWith('"')) {
      // Single-line string — extract between quotes (handle escaped quotes)
      prompt = trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
    } else if (trimmed.startsWith('`')) {
      // Template literal
      prompt = trimmed.slice(1, -1);
    } else {
      // Multi-line string concatenation — join the parts
      prompt = trimmed
        .split("\n")
        .map((l) => {
          const m = l.trim().match(/^"(.*)"$/);
          return m ? m[1] : l.trim();
        })
        .join("")
        .replace(/\\"/g, '"')
        .replace(/\\n/g, "\n");
    }

    presets.push({ id, label, category, prompt, exampleImage });
  }

  console.log(`Parsed ${presets.length} presets from presets.ts`);
  return presets;
}

// ─── Category → package name prefix ─────────────────────────────────────────

function getPackageName(preset) {
  const { id, category } = preset;
  const prefixMap = {
    Photography: "photo-",
    "Camera Styles": "camera-",
    Men: "men-",
    Women: "women-",
    Kids: "kids-",
  };
  const prefix = prefixMap[category];
  if (prefix && !id.startsWith(prefix.replace("-", ""))) {
    return `${prefix}${id}`;
  }
  // Maps and Stranger Things already have their prefixes in the id
  return id;
}

// ─── Category → tags ─────────────────────────────────────────────────────────

function buildTags(category) {
  const base = ["image-generation", "ai-prompt"];
  const catTags = {
    Photography: ["photography", "portrait"],
    Maps: ["maps", "cartography"],
    "Illustration & Art": ["illustration", "art"],
    Effects: ["effects", "editing"],
    Men: ["portrait", "men"],
    Women: ["portrait", "women"],
    Kids: ["kids", "children"],
    "Stranger Things": ["stranger-things", "fan-art"],
    "Camera Styles": ["photography", "camera"],
    "Cinematic & Film": ["cinematic", "film"],
    "Traditional Art": ["traditional-art", "painting"],
    "Design & Graphic": ["design", "graphic"],
    "3D & Game Art": ["3d", "game-art"],
    "Retro & Vintage": ["retro", "vintage"],
    "Futuristic & Sci-Fi": ["futuristic", "sci-fi"],
    "Fine Art & Historical": ["fine-art", "historical"],
    "Pop Culture & Internet": ["pop-culture", "internet"],
    "Experimental & Mixed Media": ["experimental", "mixed-media"],
  };
  return [...base, ...(catTags[category] || [])].slice(0, 5);
}

// ─── Map location defaults per map type ──────────────────────────────────────

function getMapLocationDefault(id) {
  const defaults = {
    "map-fantasy-hand-drawn": "the Enchanted Realms",
    "map-pirate-treasure": "Skull Island",
    "map-scifi-galaxy": "the Andromeda Sector",
    "map-medieval-kingdom": "the Kingdom of Eldoria",
    "map-modern-city": "New York City",
    "map-ancient-world": "the Mediterranean",
    "map-fantasy-rpg": "the Realm of Aethermoor",
    "map-steampunk-world": "the Clockwork Empire",
    "map-post-apocalyptic": "the Wasteland",
    "map-underwater-kingdom": "the Coral Throne",
    "map-space-exploration": "the Orion Arm",
    "map-historical-battle": "Gettysburg",
    "map-fantasy-island": "the Isle of Storms",
    "map-cyberpunk-city": "Neo Tokyo",
    "map-victorian-london": "Victorian London",
    "map-fantasy-watercolor": "the Emerald Continent",
    "map-dystopian-city": "District 7",
    "map-ancient-egypt": "the Nile Valley",
    "map-fantasy-cartographic": "the Known Lands",
    "map-alien-planet": "Kepler-442b",
    "map-pirate-archipelago": "the Shattered Isles",
    "map-fantasy-forest": "the Whispering Woods",
    "map-space-colony": "Mars Colony Alpha",
    "map-fantasy-desert": "the Sunscorched Wastes",
    "map-modern-subway": "London Underground",
  };
  return defaults[id] || "a mythical realm";
}

// ─── Add {{location}} to map prompts ─────────────────────────────────────────

function templateMapPrompt(prompt) {
  // Insert "of {{location}}" after the map type description
  // e.g. "Fantasy map in a hand-drawn style..." → "Fantasy map of {{location}} in a hand-drawn style..."
  return prompt.replace(
    /^((?:[\w'-]+\s+){1,5}?(?:map|Map))\s+(in\s)/,
    "$1 of {{location}} $2"
  );
}

// ─── Generate package files ──────────────────────────────────────────────────

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function generatePackage(preset) {
  const name = getPackageName(preset);
  const isMap = preset.category === "Maps";
  const tags = buildTags(preset.category);
  const imageUrl = `${baseImageUrl}/${preset.exampleImage}-640.png`;

  // Prompt text — add {{location}} for maps
  const promptText = isMap ? templateMapPrompt(preset.prompt) : preset.prompt;

  // Description for metadata (truncate if needed)
  const description =
    promptText.length > 200 ? promptText.slice(0, 197) + "..." : promptText;

  // ── metadata.json ──
  const metadata = {
    name,
    description,
    author: "prompted-photos",
    license: "MIT",
    repository: "github.com/kaihannonen/planmode.org",
    category: "ai-ml",
    tags,
    type: "prompt",
    models: ["gemini-image-pro", "openai-4o"],
    latest_version: "1.0.0",
    versions: ["1.0.0"],
    downloads: 0,
    created_at: now,
    updated_at: now,
    preview_image: imageUrl,
  };

  if (isMap) {
    metadata.variables = {
      location: {
        description: "Location or region name for the map",
        type: "string",
        required: false,
        default: getMapLocationDefault(name),
      },
    };
  }

  // ── planmode.yaml ──
  let yaml = `name: ${name}
version: 1.0.0
type: prompt
description: "${description.replace(/"/g, '\\"')}"
author: prompted-photos
license: MIT
repository: github.com/kaihannonen/planmode.org
models:
  - gemini-image-pro
  - openai-4o
tags:
${tags.map((t) => `  - ${t}`).join("\n")}
category: ai-ml
`;

  if (isMap) {
    yaml += `variables:
  location:
    description: "Location or region name for the map"
    type: string
    required: false
    default: "${getMapLocationDefault(name)}"
`;
  }

  yaml += `content_file: prompt.md
`;

  // ── prompt.md ──
  const promptMd = promptText + "\n";

  // ── versions/1.0.0.json ──
  const contentHash = sha256(promptText);
  const version = {
    version: "1.0.0",
    published_at: now,
    source: {
      repository: "github.com/kaihannonen/planmode.org",
      tag: "main",
      sha: contentHash.slice(0, 16),
      path: `registry/packages/${name}`,
    },
    files: ["planmode.yaml", "prompt.md"],
    content_hash: `sha256:${contentHash}`,
  };

  // ── packages.json summary ──
  const summary = {
    name,
    version: "1.0.0",
    type: "prompt",
    description,
    author: "prompted-photos",
    category: "ai-ml",
    tags,
    downloads: 0,
    created_at: now,
    updated_at: now,
    preview_image: imageUrl,
  };

  // ── package-details.json detail ──
  const detail = {
    ...metadata,
    content: promptText,
  };

  return { name, metadata, yaml, promptMd, version, summary, detail };
}

// ─── Main ────────────────────────────────────────────────────────────────────

const presets = parsePresets();

// Read existing data files (keep non-prompted-photos packages)
const existingPkgs = JSON.parse(
  readFileSync(join(ROOT, "src/data/packages.json"), "utf8")
);
const existingDetails = JSON.parse(
  readFileSync(join(ROOT, "src/data/package-details.json"), "utf8")
);

// Remove all existing prompted-photos entries (we'll regenerate them)
existingPkgs.packages = existingPkgs.packages.filter(
  (p) => p.author !== "prompted-photos"
);
for (const key of Object.keys(existingDetails)) {
  if (existingDetails[key]?.author === "prompted-photos") {
    delete existingDetails[key];
  }
}

let generated = 0;
let maps = 0;

for (const preset of presets) {
  const pkg = generatePackage(preset);

  // Write registry files
  const regDir = join(ROOT, "registry/packages", pkg.name);
  const versDir = join(regDir, "versions");
  mkdirSync(versDir, { recursive: true });

  writeFileSync(
    join(regDir, "metadata.json"),
    JSON.stringify(pkg.metadata, null, 2) + "\n"
  );
  writeFileSync(join(regDir, "planmode.yaml"), pkg.yaml);
  writeFileSync(join(regDir, "prompt.md"), pkg.promptMd);
  writeFileSync(
    join(versDir, "1.0.0.json"),
    JSON.stringify(pkg.version, null, 2) + "\n"
  );

  // Add to data files
  existingPkgs.packages.push(pkg.summary);
  existingDetails[pkg.name] = pkg.detail;

  generated++;
  if (preset.category === "Maps") maps++;
}

existingPkgs.updated_at = now;

// Write updated data files
writeFileSync(
  join(ROOT, "src/data/packages.json"),
  JSON.stringify(existingPkgs, null, 2) + "\n"
);
writeFileSync(
  join(ROOT, "src/data/package-details.json"),
  JSON.stringify(existingDetails, null, 2) + "\n"
);

console.log(`\nGenerated ${generated} packages from prompted.photos`);
console.log(`  Maps (with {{location}} variable): ${maps}`);

// Count by category
const byCat = {};
for (const p of presets) {
  byCat[p.category] = (byCat[p.category] || 0) + 1;
}
for (const [cat, count] of Object.entries(byCat).sort(
  (a, b) => b[1] - a[1]
)) {
  console.log(`  ${cat}: ${count}`);
}
