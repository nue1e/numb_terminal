const fs = require('fs');
const path = require('path');

// --- 1. DIRECTORIES & CONFIG ---
const LAYERS_DIR = 'C:\\NumbPolys\\numb_polys_master'; 
const WALRUS_BASE_URL = 'https://numbpolys.wal.app';
const OUTPUT_DIR = path.join(__dirname, '../src');
const REGISTRY_FILE = path.join(OUTPUT_DIR, 'registry.json');
const LEDGER_FILE = path.join(OUTPUT_DIR, 'numb_polys_rarity_ledger.txt');
const TOTAL_STANDARD_SUPPLY = 1100; 

const LAYER_ORDER = [
  'Background', 'Base Body', 'Face', 'Eye', 
  'Outfits', 'Jeweleries', 'Eyewear', 'Headwear'
];

const EARLESS_BODIES = [
  "Earless Ash Marble", "Earless Carbon Weave", "Earless Compressed Bark",
  "Earless Forest Granite", "Earless Matte Clay", "Earless Petrified Wood",
  "Earless Sienna Mocha", "Earless Void Matte"
];

const EARRINGS_TO_SKIP = [
  "24k Polished Gold Earrings", "Black Earrings", "Bronze Earrings",
  "Crimson Earrings", "Cyan Earrings", "Emerald Earrings", "Silver Earrings"
];

const TIER_LIMITS = [
  { id: "Legendary / Kingpin", count: 55 },
  { id: "Epic / Ghost", count: 110 },
  { id: "Rare / Enforcer", count: 220 },
  { id: "Uncommon / Rogue", count: 330 },
  { id: "Common / Civilian", count: 385 }
];

// --- 2. THE 11 MYTHICS ---
const MYTHICS = [
  { id: 1101, name: "The Desert Ghost", files: { "Background": "Desert Sand#16.png", "Base Body": "Textured Vantablack#6.5.png", "Face": "Bone#20.png", "Eye": "Pure White Glow#15.png", "Outfits": "Desert Sand Camo Chest Rig#2.5.png", "Jeweleries": "Gold Septum#2.png", "Eyewear": "Desert Camo Eye Patch#5.png", "Headwear": "Desert Sand Snapback#3.png" }},
  { id: 1102, name: "The Street Syndicate", files: { "Background": "Brushed Steel#8.png", "Base Body": "Bright Silver#6.5.png", "Face": "Neon Cyan#13.5.png", "Eye": "Cyber Cyan Glow#7.5.png", "Outfits": "Acid Wash Denim Hoodie#4.5.png", "Jeweleries": "Silver Earrings#14.png", "Eyewear": "Wayfarers (Black Frame)#5.png", "Headwear": "Acid Wash Denim Snapback#4.5.png" }},
  { id: 1103, name: "The Royal Don", files: { "Background": "Charcoal Seamless#20.png", "Base Body": "Pure Gold#3.png", "Face": "Void Black#34.png", "Eye": "Void Black#54.png", "Outfits": "The Royal Don Corrupted Suit#0.5.png", "Jeweleries": "24k Polished Gold Earrings#2.5.png", "Eyewear": "Wayfarers (Gold Frame)#1.5.png", "Headwear": "The Sovereign Gold Crown#0.5.png" }},
  { id: 1104, name: "The Woodland Operative", files: { "Background": "Emerald Shadow#5.5.png", "Base Body": "Earless Compressed Bark#3.png", "Face": "Bone#20.png", "Eye": "Neon Green Glow#6.png", "Outfits": "Woodland Tactical Chest Rig#1.5.png", "Jeweleries": "Silver Septum#10.png", "Eyewear": "Woodland Camo Eye Patch#5.png", "Headwear": "Woodland Camo Snapback#3.png" }},
  { id: 1105, name: "The Void Executive", files: { "Background": "Oxblood Crimson#4.5.png", "Base Body": "Earless Ash Marble#9.5.png", "Face": "Void Black#34.png", "Eye": "Void Black#54.png", "Outfits": "Cyber Vantablack Corrupted Suit#0.5.png", "Jeweleries": "Black Septum#9.png", "Eyewear": "Pure Black Eye Patch#3.5.png", "Headwear": "Stealth Tech Snapback#3.5.png" }},
  { id: 1106, name: "The Glitch Anomaly", files: { "Background": "Charcoal Seamless#20.png", "Base Body": "Bioluminescent Cyan#1.5.png", "Face": "Neon Cyan#13.5.png", "Eye": "Cyber Cyan Glow#7.5.png", "Outfits": "Monolith Grey Varsity Jacket#5.png", "Jeweleries": "Cyan Earrings#1.png", "Eyewear": "Cyan Visor#2.5.png", "Headwear": "Holographic Glass Crown#1.png" }},
  { id: 1107, name: "The Crimson Syndicate", files: { "Background": "Midnight Navy#14.png", "Base Body": "Earless Carbon Weave#1.5.png", "Face": "Earthy Bronze#27.png", "Eye": "Crimson Red#12.png", "Outfits": "Crimson Syndicate Corrupted Suit#0.5.png", "Jeweleries": "Crimson Septum#4.png", "Eyewear": "Black & White Eye Patch#3.png", "Headwear": "Acid Wash Denim Snapback#4.5.png" }},
  { id: 1108, name: "The Hazard Protocol", files: { "Background": "Charcoal Seamless#20.png", "Base Body": "Oil Slick Black#1.png", "Face": "Void Black#34.png", "Eye": "Void Black#54.png", "Outfits": "Hazard Cyber Chest Rig#1.5.png", "Jeweleries": "Black Earrings#10.png", "Eyewear": "Cyber Visor#1.png", "Headwear": "Hazard Orange Bucket Hat#2.5.png" }},
  { id: 1109, name: "The Emerald Archon", files: { "Background": "Desert Sand#16.png", "Base Body": "Gold-Veined Marble#0.5.png", "Face": "Electric Gold#4.5.png", "Eye": "Electric Gold#4.5.png", "Outfits": "Emerald Lord Corrupted Suit#0.5.png", "Jeweleries": "Emerald Earrings#5.png", "Eyewear": "Gold & Black Eye Patch#1.5.png", "Headwear": "Emerald King Crown#0.5.png" }},
  { id: 1110, name: "The Tactical Shadow", files: { "Background": "Powder Blue#13.png", "Base Body": "Sparkling Charcoal#6.5.png", "Face": "Bone#20.png", "Eye": "Pure White Glow#15.png", "Outfits": "Tactical Olive Hoodie#2.5.png", "Jeweleries": "Black Septum#9.png", "Eyewear": "Wayfarers (Black Frame)#5.png", "Headwear": "Tactical Olive Beanie#3.png" }},
  { id: 1111, name: "The Sub-Zero Operative", files: { "Background": "Midnight Navy#14.png", "Base Body": "Cosmic Wave#1.5.png", "Face": "Neon Cyan#13.5.png", "Eye": "Amethyst Purple#1.png", "Outfits": "Snow Drift Puffer#1.35.png", "Jeweleries": "Silver Earrings#14.png", "Eyewear": "Cyan Visor#2.5.png", "Headwear": "Platinum Ice Crown#1.png" }}
];

// Split Mythics based on creator selection
const RESERVED_MYTHIC_IDS = [1103, 1109, 1111, 1106, 1105];
const reservedMythics = MYTHICS.filter(m => RESERVED_MYTHIC_IDS.includes(m.id));
const publicMythics = MYTHICS.filter(m => !RESERVED_MYTHIC_IDS.includes(m.id));

// --- 3. HELPER FUNCTIONS ---
function buildWeightMaps() {
  const maps = {};
  for (const layer of LAYER_ORDER) {
    const folderPath = path.join(LAYERS_DIR, layer);
    if (!fs.existsSync(folderPath)) throw new Error(`Missing folder: ${layer}`);
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.png'));
    maps[layer] = files.map(file => {
      const match = file.match(/#(\d+(\.\d+)?)/);
      return { file, weight: match ? parseFloat(match[1]) : 1 };
    });
  }
  return maps;
}

function pickWeightedItem(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of items) {
    if (random < item.weight) return item.file;
    random -= item.weight;
  }
  return items[0].file;
}

function cleanTraitValue(filename) {
  if (!filename || filename.toLowerCase().includes('none')) return 'None';
  return filename.split('#')[0].replace('.png', '').replace(/_/g, ' ').trim();
}

function buildWalrusUrl(layer, filename) {
  if (!filename || cleanTraitValue(filename) === 'None') return null;
  return `${WALRUS_BASE_URL}/${encodeURIComponent(layer)}/${encodeURIComponent(filename)}`;
}

function generateLoreName(baseBody, outfit, background) {
  let prefix = "The Iron ";
  const bodyLower = baseBody.toLowerCase();
  if (bodyLower.includes('bioluminescent') || bodyLower.includes('cyan')) prefix = "The Neon ";
  else if (bodyLower.includes('silver')) prefix = "The Sterling ";
  else if (bodyLower.includes('gold') || bodyLower.includes('champagne')) prefix = "The Golden ";
  else if (bodyLower.includes('cosmic')) prefix = "The Astral ";
  else if (bodyLower.includes('bronze') || bodyLower.includes('copper')) prefix = "The Bronze ";
  else if (bodyLower.includes('ash')) prefix = "The Ashen ";
  else if (bodyLower.includes('carbon')) prefix = "The Carbon ";
  else if (bodyLower.includes('bark') || bodyLower.includes('wood')) prefix = "The Sylvan ";
  else if (bodyLower.includes('granite')) prefix = "The Granite ";
  else if (bodyLower.includes('clay') || bodyLower.includes('sienna') || bodyLower.includes('terracotta')) prefix = "The Earthen ";
  else if (bodyLower.includes('void') || bodyLower.includes('vantablack')) prefix = "The Void ";
  else if (bodyLower.includes('marble')) prefix = "The Marble ";
  else if (bodyLower.includes('moss')) prefix = "The Overgrown ";
  else if (bodyLower.includes('oil slick')) prefix = "The Slick ";
  else if (bodyLower.includes('rust')) prefix = "The Rusted ";
  else if (bodyLower.includes('obsidian')) prefix = "The Obsidian ";
  else if (bodyLower.includes('solar')) prefix = "The Solar ";
  else if (bodyLower.includes('charcoal')) prefix = "The Charcoal ";

  let role = "Citizen";
  const outfitLower = outfit.toLowerCase();
  if (outfitLower.includes('suit') || outfitLower.includes('executive')) {
    if (outfitLower.includes('corrupted')) role = "Syndicate";
    else if (outfitLower.includes('don') || outfitLower.includes('lord')) role = "Don";
    else role = "Broker";
  } else if (outfitLower.includes('rig') || outfitLower.includes('vest')) {
    if (outfitLower.includes('stealth') || outfitLower.includes('operative')) role = "Operative";
    else if (outfitLower.includes('hazard') || outfitLower.includes('tactical')) role = "Sentinel";
    else role = "Vanguard";
  } else if (outfitLower.includes('hoodie')) {
    if (outfitLower.includes('camo')) role = "Wraith";
    else role = "Nomad";
  } else if (outfitLower.includes('jacket')) {
    if (outfitLower.includes('phantom')) role = "Phantom";
    else if (outfitLower.includes('track')) role = "Runner";
    else role = "Striker";
  } else if (outfitLower.includes('puffer')) {
    role = "Juggernaut";
  }

  let origin = " of the Grid";
  const bgLower = background.toLowerCase();
  if (bgLower.includes('steel')) origin = " from the Chrome Wastes";
  else if (bgLower.includes('charcoal')) origin = " of the Ashes";
  else if (bgLower.includes('desert')) origin = " of the Dunes";
  else if (bgLower.includes('emerald')) origin = " of the Toxic Sector";
  else if (bgLower.includes('midnight')) origin = " of the Night Sector";
  else if (bgLower.includes('oxblood')) origin = " of the Blood Moon";
  else if (bgLower.includes('powder blue')) origin = " of the Clear Skies";
  else if (bgLower.includes('vantablack')) origin = " from the Unknown";

  return `${prefix}${role}${origin}`;
}

// --- 4. BUILD RAW TOKENS ---
console.log("🚀 Generating Numb Polys Master Registry for Walrus Mainnet...");
const WEIGHT_MAPS = buildWeightMaps();
const generatedSignatures = new Set();
const standardTokens = [];
const traitFrequencies = {};

// Roll 1,100 unique trait combinations
while (standardTokens.length < TOTAL_STANDARD_SUPPLY) {
  const rawFiles = {};
  const cleanTraits = {};
  const signatureParts = [];

  for (const layer of LAYER_ORDER) {
    let selectedFile = pickWeightedItem(WEIGHT_MAPS[layer]);
    let cleanedValue = cleanTraitValue(selectedFile);

    if (layer === 'Jeweleries' && EARLESS_BODIES.includes(cleanTraits['Base Body']) && EARRINGS_TO_SKIP.includes(cleanedValue)) {
      cleanedValue = 'None';
      selectedFile = 'None (Empty Piercings)#30.png';
    }

    rawFiles[layer] = selectedFile;
    cleanTraits[layer] = cleanedValue;
    signatureParts.push(cleanedValue);
  }

  const sig = signatureParts.join('::');
  if (!generatedSignatures.has(sig)) {
    generatedSignatures.add(sig);
    
    for (const [layer, val] of Object.entries(cleanTraits)) {
      if (val !== 'None') {
        const key = `${layer}::${val}`;
        traitFrequencies[key] = (traitFrequencies[key] || 0) + 1;
      }
    }
    standardTokens.push({ cleanTraits, rawFiles, score: 0 });
  }
}

// Statistical Rarity Score Calculation
standardTokens.forEach(token => {
  let score = 0;
  for (const [layer, val] of Object.entries(token.cleanTraits)) {
    if (val !== 'None') {
      score += (TOTAL_STANDARD_SUPPLY / traitFrequencies[`${layer}::${val}`]);
    }
  }
  token.score = score;
});
standardTokens.sort((a, b) => b.score - a.score);

// --- 5. SEGMENTED REGISTRY BUILDER ---
const reservedPool = [];
const publicPool = [];
let currentIndex = 0;

// Format all 1,100 Standard Tokens sequentially by tier
const formattedStandards = [];
TIER_LIMITS.forEach(tier => {
  const tierTokens = standardTokens.slice(currentIndex, currentIndex + tier.count);
  tierTokens.forEach(token => {
    const loreName = generateLoreName(token.cleanTraits['Base Body'], token.cleanTraits['Outfits'], token.cleanTraits['Background']);
    
    const displayAttributes = { ...token.cleanTraits };
    displayAttributes['Jewelry'] = displayAttributes['Jeweleries'];
    delete displayAttributes['Jeweleries'];
    displayAttributes['Rarity Tier'] = tier.id;

    const urls = {};
    for (const [layer, filename] of Object.entries(token.rawFiles)) {
      urls[layer] = buildWalrusUrl(layer, filename);
    }

    formattedStandards.push({
      type: "Standard",
      lore_name: loreName,
      display_traits: displayAttributes,
      walrus_files: token.rawFiles,
      walrus_urls: urls
    });
  });
  currentIndex += tier.count;
});

// Blind shuffle ONLY the 1,100 Standard tokens first
for (let i = formattedStandards.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [formattedStandards[i], formattedStandards[j]] = [formattedStandards[j], formattedStandards[i]];
}

// Slice 106 random Standard tokens for the Creator Reserve
reservedPool.push(...formattedStandards.slice(0, 106));

// Format and inject your 5 chosen Mythics into the Creator Reserve
reservedMythics.forEach(mythic => {
  const cleanMythicTraits = {};
  const urls = {};
  for (const [layer, filename] of Object.entries(mythic.files)) {
    cleanMythicTraits[layer === 'Jeweleries' ? 'Jewelry' : layer] = cleanTraitValue(filename);
    urls[layer] = buildWalrusUrl(layer, filename);
  }
  cleanMythicTraits['Rarity Tier'] = "Mythic / The Unknown";

  reservedPool.push({
    type: "Mythic",
    lore_name: mythic.name,
    display_traits: cleanMythicTraits,
    walrus_files: mythic.files,
    walrus_urls: urls
  });
});

// Shuffle the 111-token reserve so your 5 Mythics aren't predictably sitting at IDs 107-111
for (let i = reservedPool.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [reservedPool[i], reservedPool[j]] = [reservedPool[j], reservedPool[i]];
}

// Push the remaining 994 Standard tokens to the Public Pool
publicPool.push(...formattedStandards.slice(106, 1100));

// Format and inject the 6 remaining Mythics into the Public Pool
publicMythics.forEach(mythic => {
  const cleanMythicTraits = {};
  const urls = {};
  for (const [layer, filename] of Object.entries(mythic.files)) {
    cleanMythicTraits[layer === 'Jeweleries' ? 'Jewelry' : layer] = cleanTraitValue(filename);
    urls[layer] = buildWalrusUrl(layer, filename);
  }
  cleanMythicTraits['Rarity Tier'] = "Mythic / The Unknown";

  publicPool.push({
    type: "Mythic",
    lore_name: mythic.name,
    display_traits: cleanMythicTraits,
    walrus_files: mythic.files,
    walrus_urls: urls
  });
});

// Shuffle the 1,000-token public pool so the 6 Mythics are hidden
for (let i = publicPool.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [publicPool[i], publicPool[j]] = [publicPool[j], publicPool[i]];
}

// Final Assembly: 111 Reserved tokens first, followed by 1,000 Public tokens
const registry = [...reservedPool, ...publicPool];

// Assign final mint IDs (1 - 1,111)
registry.forEach((token, index) => token.id = index + 1);

// --- 6. FILE SAVING ---
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));

// Generate Rarity Ledger Text Report
let ledgerContent = `=========================================\n`;
ledgerContent += `NUMB POLYS RARITY & MINT LEDGER\n`;
ledgerContent += `Total Supply: ${registry.length} (111 Reserved, 1,000 Public)\n`;
ledgerContent += `Base Walrus CDN: ${WALRUS_BASE_URL}\n`;
ledgerContent += `=========================================\n\n`;

registry.forEach(item => {
  let reserveLabel = item.id <= 111 ? "[RESERVED Vault]" : "[PUBLIC Pool]";
  ledgerContent += `[#${item.id}] ${reserveLabel} ${item.lore_name} | Tier: ${item.display_traits['Rarity Tier']}\n`;
});

fs.writeFileSync(LEDGER_FILE, ledgerContent);

console.log(`✅ Master Registry saved to: ${REGISTRY_FILE}`);
console.log(`✅ Rarity Ledger saved to: ${LEDGER_FILE}`);
console.log(`🎯 111 locked to Reserve. 1,000 sent to Public. Ready for mainnet deployment.`);