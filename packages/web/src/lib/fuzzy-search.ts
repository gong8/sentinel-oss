// Keyboard layout coordinates for QWERTY keyboard
// Each key maps to [row, col] position
const KEYBOARD_LAYOUT: Record<string, [number, number]> = {
  // Row 0 (numbers - included for completeness)
  '1': [0, 0],
  '2': [0, 1],
  '3': [0, 2],
  '4': [0, 3],
  '5': [0, 4],
  '6': [0, 5],
  '7': [0, 6],
  '8': [0, 7],
  '9': [0, 8],
  '0': [0, 9],
  // Row 1
  q: [1, 0],
  w: [1, 1],
  e: [1, 2],
  r: [1, 3],
  t: [1, 4],
  y: [1, 5],
  u: [1, 6],
  i: [1, 7],
  o: [1, 8],
  p: [1, 9],
  // Row 2 (offset by 0.25 for realistic keyboard stagger)
  a: [2, 0.25],
  s: [2, 1.25],
  d: [2, 2.25],
  f: [2, 3.25],
  g: [2, 4.25],
  h: [2, 5.25],
  j: [2, 6.25],
  k: [2, 7.25],
  l: [2, 8.25],
  // Row 3 (offset by 0.75 for realistic keyboard stagger)
  z: [3, 0.75],
  x: [3, 1.75],
  c: [3, 2.75],
  v: [3, 3.75],
  b: [3, 4.75],
  n: [3, 5.75],
  m: [3, 6.75],
  // Space bar
  ' ': [4, 4],
};

// Calculate Euclidean distance between two keys
function keyboardDistance(a: string, b: string): number {
  const posA = KEYBOARD_LAYOUT[a.toLowerCase()];
  const posB = KEYBOARD_LAYOUT[b.toLowerCase()];

  if (!posA || !posB) {
    // If either key isn't in layout, return moderate distance
    return 1.5;
  }

  const rowDiff = posA[0] - posB[0];
  const colDiff = posA[1] - posB[1];

  return Math.sqrt(rowDiff * rowDiff + colDiff * colDiff);
}

// Semantic synonyms - bidirectional groups
const SYNONYM_GROUPS: string[][] = [
  ['create', 'add', 'new', 'make', 'insert'],
  ['delete', 'remove', 'trash', 'destroy', 'del'],
  ['edit', 'update', 'modify', 'change'],
  ['view', 'see', 'show', 'display', 'open', 'go'],
  ['list', 'all', 'browse'],
  ['user', 'member', 'person', 'account', 'users'],
  ['role', 'permission', 'access', 'roles'],
  ['policy', 'rule', 'policies', 'rules'],
  ['server', 'mcp', 'connection', 'servers'],
  ['credential', 'secret', 'key', 'token', 'credentials'],
  ['audit', 'log', 'history', 'activity', 'logs'],
  ['setting', 'config', 'configuration', 'option', 'settings'],
  ['dashboard', 'home', 'overview', 'main'],
  ['tool', 'action', 'command', 'tools'],
  ['agent', 'bot', 'assistant', 'agents'],
  ['webhook', 'hook', 'callback', 'notification', 'webhooks'],
  ['request', 'pending', 'approval', 'requests'],
  ['analytics', 'stats', 'statistics', 'metrics'],
  ['recent', 'latest', 'new'],
  ['sensitive', 'flag', 'flags'],
  ['conflict', 'conflicts'],
  ['assertion', 'assertions', 'test'],
  ['playground', 'test', 'try'],
  ['deleted', 'trash', 'removed'],
];

// Build synonym lookup map
const SYNONYM_MAP: Map<string, Set<string>> = new Map();
for (const group of SYNONYM_GROUPS) {
  for (const word of group) {
    const existing = SYNONYM_MAP.get(word) ?? new Set();
    for (const synonym of group) {
      if (synonym !== word) {
        existing.add(synonym);
      }
    }
    SYNONYM_MAP.set(word, existing);
  }
}

// Get all synonyms for a word
function getSynonyms(word: string): string[] {
  const lowerWord = word.toLowerCase();
  const synonyms = SYNONYM_MAP.get(lowerWord);
  return synonyms ? Array.from(synonyms) : [];
}

// Keyboard-weighted Levenshtein distance
// Substitutions are weighted by keyboard distance (adjacent keys = lower cost)
function keyboardLevenshtein(source: string, target: string): number {
  const s = source.toLowerCase();
  const t = target.toLowerCase();

  if (s === t) return 0;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;

  // Create distance matrix
  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= s.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= t.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      if (s[i - 1] === t[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        // Keyboard-weighted substitution cost
        const kbDist = keyboardDistance(s[i - 1], t[j - 1]);
        // Adjacent keys (distance < 1.5) get much lower penalty (0.2 to 0.7)
        // Far keys get higher penalty (0.7 to 1.0)
        const substitutionCost = Math.min(0.2 + kbDist / 5, 1.0);

        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 0.8, // deletion (slightly cheaper)
          matrix[i][j - 1] + 0.8, // insertion (slightly cheaper)
          matrix[i - 1][j - 1] + substitutionCost, // substitution
        );
      }
    }
  }

  return matrix[s.length][t.length];
}

// Check if a single query word fuzzy-matches a single target word
function fuzzyWordMatch(queryWord: string, targetWord: string, maxDistance: number): boolean {
  const q = queryWord.toLowerCase();
  const t = targetWord.toLowerCase();

  // Exact match
  if (t === q) return true;

  // Prefix match (typing in progress)
  if (t.startsWith(q) || q.startsWith(t)) return true;

  // Contains match for longer queries
  if (q.length >= 3 && t.includes(q)) return true;

  // Fuzzy match with keyboard distance
  if (q.length >= 2 && t.length >= 2) {
    const distance = keyboardLevenshtein(q, t);
    if (distance <= maxDistance) {
      return true;
    }
  }

  return false;
}

// Calculate max allowed distance based on word length
function getMaxDistance(wordLength: number): number {
  // More permissive: allow ~60% of word length as errors for short words
  // and scale down for longer words
  if (wordLength <= 3) return 1.5;
  if (wordLength <= 5) return 2.0;
  if (wordLength <= 7) return 2.5;
  return 3.0;
}

// Calculate match score between a query word and target word, with optional penalty
function getMatchScore(queryWord: string, targetWord: string, penalty: number): number | null {
  const maxDist = getMaxDistance(Math.min(queryWord.length, targetWord.length));

  if (!fuzzyWordMatch(queryWord, targetWord, maxDist)) {
    return null;
  }

  const qLower = queryWord.toLowerCase();
  const tLower = targetWord.toLowerCase();

  if (tLower === qLower) {
    return penalty;
  }
  if (tLower.startsWith(qLower)) {
    return 0.05 + penalty;
  }

  const distance = keyboardLevenshtein(queryWord, targetWord);
  return distance / Math.max(queryWord.length, targetWord.length) + penalty;
}

// Find the best match score for a query word across a list of target words
function findBestMatchScore(
  queryWord: string,
  targetWords: string[],
  penalty: number,
): number | null {
  let best: number | null = null;

  for (const target of targetWords) {
    const score = getMatchScore(queryWord, target, penalty);
    if (score !== null && (best === null || score < best)) {
      best = score;
    }
  }

  return best;
}

// Check if query matches target (word-by-word matching)
function queryMatchesTarget(
  queryWords: string[],
  targetWords: string[],
  targetKeywords: string[] = [],
): { matches: boolean; score: number } {
  if (queryWords.length === 0) {
    return { matches: true, score: 1 };
  }

  let totalScore = 0;
  let matchedQueryWords = 0;

  for (const qWord of queryWords) {
    let bestWordScore: number | null = null;

    // Check against target words (no penalty)
    const targetScore = findBestMatchScore(qWord, targetWords, 0);
    if (targetScore !== null) {
      bestWordScore = targetScore;
    }

    // Check keywords (slight penalty)
    const allKeywordWords = targetKeywords.flatMap((kw) => kw.toLowerCase().split(/\s+/));
    const keywordScore = findBestMatchScore(qWord, allKeywordWords, 0.1);
    if (keywordScore !== null && (bestWordScore === null || keywordScore < bestWordScore)) {
      bestWordScore = keywordScore;
    }

    // Check synonyms of query word against target (slight penalty)
    const synonyms = getSynonyms(qWord);
    for (const synonym of synonyms) {
      const synonymScore = findBestMatchScore(synonym, targetWords, 0.05);
      if (synonymScore !== null && (bestWordScore === null || synonymScore < bestWordScore)) {
        bestWordScore = synonymScore;
      }
    }

    if (bestWordScore !== null) {
      matchedQueryWords++;
      totalScore += bestWordScore;
    }
  }

  const minMatchRatio = queryWords.length === 1 ? 1 : 0.5;
  const matchRatio = matchedQueryWords / queryWords.length;

  if (matchRatio >= minMatchRatio) {
    const avgScore = totalScore / queryWords.length;
    const unmatchedPenalty = (1 - matchRatio) * 0.5;
    return { matches: true, score: avgScore + unmatchedPenalty };
  }

  return { matches: false, score: Infinity };
}

export interface SearchableItem {
  id: string;
  label: string;
  keywords?: string[];
}

export interface SearchResult<T extends SearchableItem> {
  item: T;
  score: number;
}

// Main search function
export function fuzzySearch<T extends SearchableItem>(
  query: string,
  items: T[],
  options: { maxResults?: number } = {},
): SearchResult<T>[] {
  const { maxResults = 20 } = options;

  const trimmedQuery = query.trim().toLowerCase();

  if (!trimmedQuery) {
    // Return all items with neutral score when no query
    return items.slice(0, maxResults).map((item) => ({ item, score: 1 }));
  }

  const queryWords = trimmedQuery.split(/\s+/).filter((w) => w.length > 0);
  const results: SearchResult<T>[] = [];

  for (const item of items) {
    const targetWords = item.label.toLowerCase().split(/\s+/);
    const { matches, score } = queryMatchesTarget(queryWords, targetWords, item.keywords);

    if (matches) {
      results.push({ item, score });
    }
  }

  // Sort by score (lower is better) and return top results
  results.sort((a, b) => a.score - b.score);
  return results.slice(0, maxResults);
}

// Export utilities for testing
export { fuzzyWordMatch, getSynonyms, keyboardDistance, keyboardLevenshtein };
