export interface Version {
  id: string;
  label: string;
  isLatest: boolean;
  releaseDate: string;
}

export const versions: Version[] = [
  { id: 'v2', label: '2.0', isLatest: true, releaseDate: '2026-01-01' },
  { id: 'v1', label: '1.0', isLatest: false, releaseDate: '2025-06-01' },
];

export const latestVersion = versions.find((v) => v.isLatest) ?? versions[0];

export function getCurrentVersion(pathname: string): Version {
  // Extract version from path like /docs/v1/quickstart
  const match = pathname.match(/\/v(\d+)\//);
  if (match) {
    const versionId = `v${match[1]}`;
    const version = versions.find((v) => v.id === versionId);
    if (version) return version;
  }
  return latestVersion;
}

export function getVersionedPath(path: string, version: Version): string {
  // Remove existing version if present
  const cleanPath = path.replace(/\/v\d+\//, '/');
  // Insert version
  return cleanPath.replace('/docs/', `/docs/${version.id}/`);
}
