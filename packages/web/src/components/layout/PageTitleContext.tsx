import * as React from 'react';

interface PageTitleState {
  title: string;
  description?: string;
}

interface PageTitleContextValue {
  pageTitle: PageTitleState;
  setPageTitle: (title: string, description?: string) => void;
}

const PageTitleContext = React.createContext<PageTitleContextValue | null>(null);

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [pageTitle, setPageTitleState] = React.useState<PageTitleState>({ title: '' });

  const setPageTitle = React.useCallback((title: string, description?: string) => {
    setPageTitleState((prev) => {
      if (prev.title === title && prev.description === description) {
        return prev;
      }
      return { title, description };
    });
  }, []);

  const value = React.useMemo(() => ({ pageTitle, setPageTitle }), [pageTitle, setPageTitle]);

  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>;
}

export function usePageTitle(): PageTitleState {
  const context = React.useContext(PageTitleContext);
  if (!context) {
    throw new Error('usePageTitle must be used within a PageTitleProvider');
  }
  return context.pageTitle;
}

export function useSetPageTitle(title: string, description?: string): void {
  const context = React.useContext(PageTitleContext);
  if (!context) {
    throw new Error('useSetPageTitle must be used within a PageTitleProvider');
  }

  const { setPageTitle } = context;

  React.useEffect(() => {
    setPageTitle(title, description);
  }, [title, description, setPageTitle]);
}

/**
 * Component that sets the page title. Use this when you need to set the title
 * from within a component tree that's already inside PageTitleProvider.
 */
export function SetPageTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}): null {
  useSetPageTitle(title, description);
  return null;
}
