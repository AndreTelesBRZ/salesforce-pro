import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const outputPath = path.join(rootDir, 'src', 'buildInfo.ts');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version = process.env.VITE_APP_VERSION || packageJson.version || '1.0.0';

const now = new Date();
const buildDate = now.toISOString();
const dateStamp = buildDate.slice(0, 10).replace(/-/g, '');
const buildSequence = process.env.BUILD_SEQUENCE || process.env.VITE_APP_BUILD_SEQUENCE || '001';
const buildCode = process.env.VITE_APP_BUILD || `${dateStamp}.${buildSequence}`;

const getCommit = () => {
  if (process.env.VITE_APP_COMMIT) return process.env.VITE_APP_COMMIT;

  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
  } catch {
    return '';
  }
};

const commit = getCommit();

const fileContents = `export const BUILD_INFO = {
  version: ${JSON.stringify(version)},
  build: ${JSON.stringify(buildCode)},
  commit: ${JSON.stringify(commit)},
  buildDate: ${JSON.stringify(buildDate)},
} as const;
`;

writeFileSync(outputPath, fileContents, 'utf8');

console.log(`Build info generated: v${version} (${buildCode})${commit ? ` ${commit}` : ''}`);
