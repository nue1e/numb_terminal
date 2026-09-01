// 1. Exact Z-Index Hierarchy (Lowest to Highest)
export const LAYER_ORDER = [
  'background',
  'base body',
  'face',
  'eye',
  'outfits',
  'jewelries',
  'headwear',
  'eyewear',
] as const;

// 2. Testnet Trait Pool (Matching your new exact filenames)
export const TRAIT_REGISTRY: Record<string, string[]> = {
  'background': [
    'Brushed_Steel_8.png',
    'Vantablack_Void_1.png'
  ],
  'base body': [
    'Earless_Matte_Clay_9.5.png',
    'Textured_Vantablack_6.5.png'
  ],
  'face': [
    'Bone_20.png',
    'Rose_Gold_Face_1.png'
  ],
  'eye': [
    'Amethyst_Purple_1.png',
    'Pure_White_Glow_15.png'
  ],
  'outfits': [
    'Snow_Drift_Puffer_1.35.png',
    'Stealth_Black_Tech_Vest_3.png'
  ],
  'jewelries': [
    'None_Empty_Piercings_30.png',
    'Silver_Septum_10.png'
  ],
  'headwear': [
    'Heavyweight_Black_Beanie_2.png',
    'None_No_Headwear_20.png'
  ],
  'eyewear': [
    'None_No_Eyewear_50.png',
    'Wayfarers_Black_Frame_5.png'
  ],
};

// 3. Generative Randomizer
export function generateRandomOperative(): string[] {
  return LAYER_ORDER.map((category) => {
    const options = TRAIT_REGISTRY[category];
    const selected = options[Math.floor(Math.random() * options.length)];
    return `${category}/${selected}`;
  });
}