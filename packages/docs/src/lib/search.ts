import MiniSearch from 'minisearch';
import { navigation } from './navigation';

export interface SearchResult {
  slug: string;
  title: string;
  section: string;
  score: number;
}

interface SearchDocument {
  id: string;
  title: string;
  section: string;
  slug: string;
  content: string;
}

// Initialize MiniSearch with configuration
const searchIndex = new MiniSearch<SearchDocument>({
  fields: ['title', 'content', 'section'],
  storeFields: ['title', 'slug', 'section'],
  searchOptions: {
    boost: { title: 2 },
    fuzzy: 0.2,
    prefix: true,
  },
});

// Track if index has been built
let indexBuilt = false;

// Build search index from navigation
export function buildSearchIndex(): void {
  if (indexBuilt) return;

  const documents: SearchDocument[] = [];

  navigation.forEach((section) => {
    section.items.forEach((item) => {
      documents.push({
        id: item.href,
        title: item.title,
        section: section.title,
        slug: item.href,
        content: item.description ?? '',
      });
    });
  });

  searchIndex.addAll(documents);
  indexBuilt = true;
}

// Search documentation
export function searchDocs(query: string): SearchResult[] {
  // Ensure index is built
  if (!indexBuilt) {
    buildSearchIndex();
  }

  if (!query || query.length < 2) {
    return [];
  }

  const results = searchIndex.search(query);

  return results.map((result) => ({
    slug: result.slug,
    title: result.title,
    section: result.section,
    score: result.score,
  }));
}

// Add documents to search index (for dynamic content)
export function indexDocument(doc: {
  slug: string;
  title: string;
  section: string;
  content: string;
}): void {
  // Ensure index is built first
  if (!indexBuilt) {
    buildSearchIndex();
  }

  // Check if document already exists
  const existing = searchIndex.has(doc.slug);
  if (existing) {
    searchIndex.discard(doc.slug);
  }

  searchIndex.add({
    id: doc.slug,
    ...doc,
  });
}
