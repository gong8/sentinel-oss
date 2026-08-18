import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DocPage } from './pages/DocPage';
import { DocsHome } from './pages/DocsHome';
import { NotFound } from './pages/NotFound';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<DocsHome />} />
          <Route path="docs" element={<Navigate to="/docs/getting-started/quickstart" replace />} />
          <Route path="docs/:section/:slug" element={<DocPage />} />
          <Route path="docs/:version/:section/:slug" element={<DocPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
