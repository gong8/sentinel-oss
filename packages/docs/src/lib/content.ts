// Content loading utilities for MDX documentation

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  section: string;
  order: number;
  content: string;
  plainText: string;
}

export interface DocFrontmatter {
  title: string;
  description?: string;
  section?: string;
  order?: number;
}

// Map of all documentation pages
// In a real implementation, this would be generated at build time from MDX files
const docs: Map<string, DocPage> = new Map();

export function getAllDocs(): DocPage[] {
  return Array.from(docs.values()).sort((a, b) => a.order - b.order);
}

export function getDocBySlug(slug: string): DocPage | undefined {
  return docs.get(slug);
}

export function getDocsBySection(section: string): DocPage[] {
  return getAllDocs().filter((doc) => doc.section === section);
}

// Register a document (called during build/dev)
export function registerDoc(doc: DocPage): void {
  docs.set(doc.slug, doc);
}

// Extract plain text from MDX for search indexing
export function extractPlainText(content: string): string {
  return (
    content
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      // Remove inline code
      .replace(/`[^`]+`/g, '')
      // Remove MDX components
      .replace(/<[^>]+>/g, '')
      // Remove markdown links but keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove headers markers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove emphasis markers
      .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}
