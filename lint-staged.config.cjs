// Files to ignore (matches .prettierignore and eslint.config.mjs ignores)
const ignorePatterns = [
  /node_modules/,
  /dist\//,
  /coverage\//,
  /\.turbo\//,
  /playwright-report\//,
  /\.next\//,
  /landing\//,
  /test\/seed-generation\//,
  /packages\/db\/prisma\/seed-archives\//,
  /packages\/db\/prisma\/seed\.ts$/,
  /packages\/db\/prisma\/seed\.backup\.ts$/,
  /packages\/db\/prisma\/creds\.ts$/,
  /\.claude\//,
  /test-results\//,
  /test\/results\//,
];

const filterIgnored = (files) =>
  files.filter((file) => !ignorePatterns.some((pattern) => pattern.test(file)));

module.exports = {
  '*.{js,cjs,mjs,ts,tsx}': (files) => {
    const filtered = filterIgnored(files);
    if (filtered.length === 0) return [];
    return [
      // Run eslint sequentially to avoid SIGKILL / OOM when many files are staged
      `eslint --max-warnings=0 --fix ${filtered.join(' ')}`,
      `prettier --write ${filtered.join(' ')}`,
    ];
  },

  '*.{json,md,yml,yaml}': (files) => {
    const filtered = filterIgnored(files);
    if (filtered.length === 0) return [];
    return [`prettier --write ${filtered.join(' ')}`];
  },

  '*.{css,scss}': (files) => {
    const filtered = filterIgnored(files);
    if (filtered.length === 0) return [];
    return [
      // Force the known-good pnpm binary (avoid random pnpm 8.x shims)
      `/opt/homebrew/bin/pnpm --filter @sentinel/web exec stylelint --fix ${filtered.join(' ')}`,
      `prettier --write ${filtered.join(' ')}`,
    ];
  },
};
