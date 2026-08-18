import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function TableOfContents() {
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const location = useLocation();

  useEffect(() => {
    // Extract headings from the page
    const article = document.querySelector('.docs-content');
    if (!article) return;

    const elements = article.querySelectorAll('h2, h3');
    const items: TocItem[] = [];

    elements.forEach((el) => {
      if (el.id) {
        items.push({
          id: el.id,
          text: el.textContent ?? '',
          level: el.tagName === 'H2' ? 2 : 3,
        });
      }
    });

    setHeadings(items);
  }, [location]);

  useEffect(() => {
    // Intersection observer for active heading
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-80px 0px -80% 0px',
        threshold: 0,
      },
    );

    headings.forEach((heading) => {
      const el = document.getElementById(heading.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) {
    return null;
  }

  return (
    <nav className="space-y-1">
      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
        On this page
      </p>
      <ul className="space-y-1 border-l border-border">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              className={cn(
                'toc-link',
                heading.level === 3 && 'depth-3',
                activeId === heading.id && 'active',
              )}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(heading.id);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth' });
                  setActiveId(heading.id);
                }
              }}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
