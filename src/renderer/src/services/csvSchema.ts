/**
 * CSV schema registry for microstock platforms.
 *
 * Each microstock site (Adobe Stock, Shutterstock, Freepik, Pond5, 123RF, …)
 * accepts a different bulk-metadata CSV layout. Column names, ordering, and
 * delimiters all differ. Rather than emitting one generic CSV and asking the
 * user to massage it before upload, the Export page now picks a schema based
 * on the user's `settings.platformPreset` and emits a CSV that is ready to
 * drop into that platform's contributor portal.
 *
 * This module owns:
 *   - the canonical "source row" (everything we know about an `AppFile`,
 *     normalized into a flat string-keyed record)
 *   - the per-platform schema definitions (column list, header label,
 *     delimiter)
 *   - a heuristic that picks the Adobe Stock numeric category from a file's
 *     title + keywords
 *
 * The Settings → Custom mode lets the user override the schema for the
 * `Custom` platform; that override is persisted in `AppSettings.customCsvSchema`
 * and consumed here via `getSchema(platform, custom)`.
 */

import type { AppFile, AppSettings } from '@renderer/types'

/** Stable platform identifiers. Must match the union in `AppSettings.platformPreset`. */
export type Platform = AppSettings['platformPreset']

/**
 * Canonical source keys that any schema column can pull from. Keep this set
 * tightly scoped — adding a key here means UI work in the Custom editor.
 */
export type SourceKey =
  | 'filename'
  | 'originalFilename'
  | 'newFilename'
  | 'title'
  | 'description'
  | 'keywords'
  | 'category'
  | 'adobeCategory'
  | 'fileType'
  | 'status'
  | 'apiProvider'
  | 'empty'

export interface SchemaColumn {
  /** Header label as it appears in the CSV's first row. */
  header: string
  /** Where the cell value comes from. `'empty'` writes a blank cell. */
  source: SourceKey
}

export type Delimiter = ',' | ';' | '\t'

export interface CsvSchema {
  /** Platform name shown in the Export page dropdown. */
  label: string
  columns: SchemaColumn[]
  delimiter: Delimiter
}

/**
 * Built-in schemas. The string keys mirror `Platform`, so `getSchema()` can
 * trivially look one up.
 */
export const PLATFORM_SCHEMAS: Record<Exclude<Platform, 'Custom'>, CsvSchema> = {
  // Adobe Stock contributor CSV: filename, title, keywords (semicolon-joined
  // *inside* a single cell), numeric category 1-21, model release placeholder.
  // Source: https://helpx.adobe.com/stock/contributor/help/csv-uploads.html
  'Adobe Stock': {
    label: 'Adobe Stock',
    columns: [
      { header: 'Filename', source: 'filename' },
      { header: 'Title', source: 'title' },
      { header: 'Keywords', source: 'keywords' },
      { header: 'Category', source: 'adobeCategory' },
      { header: 'Releases', source: 'empty' }
    ],
    delimiter: ','
  },
  // Shutterstock contributor template. Description is the long blurb (we
  // populate from the AI description). Categories/Editorial/Mature/Illustration
  // are left blank for the user to fill in their portal because Shutterstock's
  // category list is long and the AI doesn't reliably classify into it yet.
  Shutterstock: {
    label: 'Shutterstock',
    columns: [
      { header: 'Filename', source: 'filename' },
      { header: 'Description', source: 'description' },
      { header: 'Keywords', source: 'keywords' },
      { header: 'Categories', source: 'empty' },
      { header: 'Editorial', source: 'empty' },
      { header: 'Mature content', source: 'empty' },
      { header: 'Illustration', source: 'empty' }
    ],
    delimiter: ','
  },
  // Freepik AI bulk template — semicolon delimited, lowercase headers.
  Freepik: {
    label: 'Freepik',
    columns: [
      { header: 'filename', source: 'filename' },
      { header: 'title', source: 'title' },
      { header: 'keywords', source: 'keywords' }
    ],
    delimiter: ';'
  },
  // Pond5 contributor batch upload spreadsheet.
  Pond5: {
    label: 'Pond5',
    columns: [
      { header: 'Filename', source: 'filename' },
      { header: 'Title', source: 'title' },
      { header: 'Description', source: 'description' },
      { header: 'Keywords', source: 'keywords' }
    ],
    delimiter: ','
  }
}

/** Default starter schema users get when they first switch platform to Custom. */
export const DEFAULT_CUSTOM_SCHEMA: CsvSchema = {
  label: 'Custom',
  columns: [
    { header: 'Filename', source: 'filename' },
    { header: 'Title', source: 'title' },
    { header: 'Description', source: 'description' },
    { header: 'Keywords', source: 'keywords' }
  ],
  delimiter: ','
}

export function getSchema(platform: Platform, custom?: CsvSchema | null): CsvSchema {
  if (platform === 'Custom') return custom ?? DEFAULT_CUSTOM_SCHEMA
  return PLATFORM_SCHEMAS[platform]
}

// ---------------------------------------------------------------------------
// Adobe Stock category heuristic
// ---------------------------------------------------------------------------

/**
 * Adobe Stock's contributor CSV expects a numeric `Category` (1-21). The AI
 * doesn't return that number directly — it gives free-form keywords + a title.
 * We score each of the 21 buckets by counting keyword matches against a
 * small curated vocabulary per bucket, then return the top scorer. This is a
 * heuristic, not a classifier: it is intentionally conservative and falls
 * back to category 8 (Graphic Resources) when nothing matches strongly.
 *
 * Source of category numbering:
 * https://helpx.adobe.com/stock/contributor/help/keywording-and-categories.html
 */
const ADOBE_CATEGORY_VOCAB: Array<{ id: number; tokens: string[] }> = [
  // 1 Animals
  {
    id: 1,
    tokens: [
      'animal',
      'dog',
      'cat',
      'puppy',
      'kitten',
      'wildlife',
      'bird',
      'fish',
      'horse',
      'cow',
      'sheep',
      'lion',
      'tiger',
      'bear',
      'wolf',
      'fox',
      'deer',
      'rabbit',
      'mouse',
      'rat',
      'snake',
      'lizard',
      'turtle',
      'frog',
      'butterfly',
      'insect',
      'bee',
      'pet'
    ]
  },
  // 2 Buildings and Architecture
  {
    id: 2,
    tokens: [
      'building',
      'architecture',
      'house',
      'home',
      'tower',
      'skyscraper',
      'bridge',
      'church',
      'temple',
      'mosque',
      'castle',
      'monument',
      'facade',
      'window',
      'door',
      'roof',
      'interior',
      'exterior',
      'structure',
      'construction'
    ]
  },
  // 3 Business
  {
    id: 3,
    tokens: [
      'business',
      'office',
      'meeting',
      'businessman',
      'businesswoman',
      'corporate',
      'finance',
      'banking',
      'money',
      'currency',
      'investment',
      'startup',
      'entrepreneur',
      'manager',
      'executive',
      'briefcase',
      'handshake',
      'contract',
      'document',
      'graph',
      'chart',
      'analytics',
      'marketing',
      'sales'
    ]
  },
  // 4 Drinks
  {
    id: 4,
    tokens: [
      'drink',
      'beverage',
      'coffee',
      'tea',
      'juice',
      'cocktail',
      'wine',
      'beer',
      'whiskey',
      'vodka',
      'champagne',
      'soda',
      'lemonade',
      'smoothie',
      'milk',
      'water',
      'glass',
      'bottle',
      'mug',
      'cup'
    ]
  },
  // 5 The Environment
  {
    id: 5,
    tokens: [
      'environment',
      'pollution',
      'recycle',
      'recycling',
      'sustainability',
      'green',
      'eco',
      'ecology',
      'climate',
      'global warming',
      'renewable',
      'wind turbine',
      'solar panel',
      'forest',
      'ocean',
      'conservation'
    ]
  },
  // 6 States of Mind
  {
    id: 6,
    tokens: [
      'mood',
      'emotion',
      'feeling',
      'happy',
      'sad',
      'angry',
      'calm',
      'anxious',
      'stress',
      'depression',
      'meditation',
      'mindfulness',
      'thoughtful',
      'pensive',
      'joy',
      'love',
      'fear',
      'surprise'
    ]
  },
  // 7 Food
  {
    id: 7,
    tokens: [
      'food',
      'meal',
      'cuisine',
      'recipe',
      'cooking',
      'baking',
      'bread',
      'cake',
      'pastry',
      'fruit',
      'vegetable',
      'meat',
      'chicken',
      'beef',
      'fish',
      'pasta',
      'rice',
      'salad',
      'dessert',
      'breakfast',
      'lunch',
      'dinner',
      'snack',
      'kitchen',
      'chef'
    ]
  },
  // 8 Graphic Resources (default fallback — vague visual assets)
  {
    id: 8,
    tokens: [
      'background',
      'pattern',
      'texture',
      'wallpaper',
      'gradient',
      'abstract',
      'geometric',
      'illustration',
      'vector',
      'icon',
      'logo',
      'banner',
      'frame',
      'border',
      'template',
      'design'
    ]
  },
  // 9 Hobbies and Leisure
  {
    id: 9,
    tokens: [
      'hobby',
      'leisure',
      'craft',
      'knitting',
      'painting',
      'drawing',
      'photography',
      'gardening',
      'fishing',
      'camping',
      'gaming',
      'puzzle',
      'collection',
      'reading',
      'music instrument',
      'sewing'
    ]
  },
  // 10 Industry
  {
    id: 10,
    tokens: [
      'industry',
      'industrial',
      'factory',
      'manufacturing',
      'warehouse',
      'machinery',
      'engineer',
      'engineering',
      'mining',
      'oil',
      'gas',
      'pipeline',
      'crane',
      'construction site',
      'worker'
    ]
  },
  // 11 Landscapes
  {
    id: 11,
    tokens: [
      'landscape',
      'mountain',
      'valley',
      'desert',
      'beach',
      'sea',
      'ocean',
      'river',
      'lake',
      'waterfall',
      'forest',
      'sunset',
      'sunrise',
      'sky',
      'cloud',
      'horizon',
      'panorama',
      'scenic',
      'nature',
      'field',
      'meadow'
    ]
  },
  // 12 Lifestyle
  {
    id: 12,
    tokens: [
      'lifestyle',
      'family',
      'home life',
      'parent',
      'child',
      'kids',
      'baby',
      'couple',
      'friends',
      'fashion',
      'style',
      'shopping',
      'wellness',
      'self care',
      'morning routine',
      'cozy'
    ]
  },
  // 13 People
  {
    id: 13,
    tokens: [
      'people',
      'person',
      'man',
      'woman',
      'girl',
      'boy',
      'portrait',
      'face',
      'smile',
      'group',
      'crowd',
      'human',
      'adult',
      'senior',
      'teenager',
      'child portrait',
      'elderly'
    ]
  },
  // 14 Plants and Flowers
  {
    id: 14,
    tokens: [
      'plant',
      'flower',
      'flowers',
      'tree',
      'leaf',
      'leaves',
      'rose',
      'tulip',
      'sunflower',
      'orchid',
      'bouquet',
      'garden',
      'botanical',
      'cactus',
      'bonsai',
      'fern',
      'moss',
      'foliage'
    ]
  },
  // 15 Culture and Religion
  {
    id: 15,
    tokens: [
      'culture',
      'tradition',
      'religion',
      'religious',
      'spiritual',
      'pray',
      'prayer',
      'church',
      'temple',
      'mosque',
      'cathedral',
      'priest',
      'monk',
      'festival',
      'ceremony',
      'ritual',
      'heritage'
    ]
  },
  // 16 Science
  {
    id: 16,
    tokens: [
      'science',
      'scientist',
      'laboratory',
      'lab',
      'research',
      'microscope',
      'experiment',
      'chemistry',
      'biology',
      'physics',
      'medical',
      'medicine',
      'dna',
      'molecule',
      'genome',
      'space',
      'astronomy'
    ]
  },
  // 17 Social Issues
  {
    id: 17,
    tokens: [
      'social issue',
      'protest',
      'rally',
      'equality',
      'diversity',
      'inclusion',
      'human rights',
      'poverty',
      'homeless',
      'war',
      'peace',
      'refugee',
      'activism'
    ]
  },
  // 18 Sports
  {
    id: 18,
    tokens: [
      'sport',
      'sports',
      'football',
      'soccer',
      'basketball',
      'tennis',
      'baseball',
      'cricket',
      'golf',
      'running',
      'marathon',
      'cycling',
      'swimming',
      'yoga',
      'fitness',
      'gym',
      'workout',
      'athlete',
      'stadium'
    ]
  },
  // 19 Technology
  {
    id: 19,
    tokens: [
      'technology',
      'tech',
      'computer',
      'laptop',
      'smartphone',
      'phone',
      'tablet',
      'screen',
      'monitor',
      'keyboard',
      'mouse device',
      'circuit',
      'chip',
      'processor',
      'server',
      'data center',
      'ai',
      'artificial intelligence',
      'machine learning',
      'robot',
      'robotics',
      'software',
      'hardware',
      'network',
      'internet',
      'cloud computing',
      'cybersecurity'
    ]
  },
  // 20 Transport
  {
    id: 20,
    tokens: [
      'transport',
      'transportation',
      'car',
      'truck',
      'bus',
      'train',
      'airplane',
      'plane',
      'helicopter',
      'ship',
      'boat',
      'yacht',
      'motorcycle',
      'bicycle',
      'scooter',
      'highway',
      'road',
      'traffic'
    ]
  },
  // 21 Travel
  {
    id: 21,
    tokens: [
      'travel',
      'tourism',
      'tourist',
      'vacation',
      'holiday',
      'destination',
      'sightseeing',
      'landmark',
      'passport',
      'luggage',
      'suitcase',
      'airport',
      'resort',
      'hotel',
      'beach holiday',
      'city break',
      'adventure'
    ]
  }
]

/**
 * Score every Adobe category against the file's title + keywords and return
 * the winning numeric ID. Returns 8 (Graphic Resources) if nothing matches —
 * Adobe accepts that as a valid neutral fallback.
 */
export function pickAdobeCategory(title: string | undefined, keywords: string[] | undefined): number {
  const haystack = (
    (title ?? '') +
    ' ' +
    (keywords ?? []).join(' ')
  ).toLowerCase()
  if (!haystack.trim()) return 8
  let bestId = 8
  let bestScore = 0
  for (const bucket of ADOBE_CATEGORY_VOCAB) {
    let score = 0
    for (const t of bucket.tokens) {
      // word-ish boundary so "ai" doesn't match "stair" etc.
      const re = new RegExp(`(^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'g')
      const matches = haystack.match(re)
      if (matches) score += matches.length
    }
    if (score > bestScore) {
      bestScore = score
      bestId = bucket.id
    }
  }
  return bestId
}

// ---------------------------------------------------------------------------
// Source row builder + schema applier
// ---------------------------------------------------------------------------

export interface SourceRow {
  filename: string
  originalFilename: string
  newFilename: string
  title: string
  description: string
  keywords: string
  category: string
  adobeCategory: string
  fileType: string
  status: string
  apiProvider: string
  empty: string
}

/**
 * Convert a single AppFile into the canonical key/value record that schemas
 * read from. Keeps all fields as strings so CSV/TXT/XLSX writers don't need
 * to think about types. Keywords are joined with `, ` for cell-friendly
 * output; platforms that need a different separator (e.g. Freepik) get the
 * delimiter applied at write time, not here.
 */
export function buildSourceRow(f: AppFile): SourceRow {
  const m = f.editedMetadata ?? f.aiMetadata
  const title = m?.title ?? ''
  const description = m?.description ?? ''
  const keywords = m?.keywords ?? []
  return {
    filename: f.currentFilename,
    originalFilename: f.originalFilename,
    newFilename: f.renamePreview ?? '',
    title,
    description,
    keywords: keywords.join(', '),
    category: m?.category ?? '',
    adobeCategory: String(pickAdobeCategory(title, keywords)),
    fileType: String(f.fileType).toLowerCase(),
    status: f.status,
    apiProvider: f.apiProvider ?? '',
    empty: ''
  }
}

/**
 * Apply a schema to a list of source rows. Returns headers + 2D string
 * array. The caller (Export IPC) is responsible for joining with the
 * schema's delimiter and CSV-escaping each cell.
 */
export function applySchema(
  rows: SourceRow[],
  schema: CsvSchema
): { headers: string[]; data: string[][] } {
  const headers = schema.columns.map((c) => c.header)
  const data = rows.map((r) => schema.columns.map((c) => r[c.source] ?? ''))
  return { headers, data }
}
