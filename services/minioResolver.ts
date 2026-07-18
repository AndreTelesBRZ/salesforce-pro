const TENANT_MINIO_MAP: Record<string, string> = {
  'edsondosparafusos.app.br': 'https://minio.edsondosparafusos.app.br',
  'llfix.app.br': 'https://minio.llfix.app.br',
};

const BUCKET = 'produtos';
const EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg'];

const CATEGORY_MAP: Record<string, string> = {
  'PARAF': 'Parafuso',
  'JG': 'Jogo',
  'JOGO': 'Jogo',
};

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function normalizeCategory(word: string): string {
  const upper = word.toUpperCase();
  return CATEGORY_MAP[upper] || capitalize(word);
}

function extractCategory(description: string): string | undefined {
  const words = description.trim().split(/\s+/);
  if (words.length === 0) return undefined;
  return normalizeCategory(words[0]);
}

function extractSubcategory(description: string): string | undefined {
  const words = description.trim().split(/\s+/);
  if (words.length < 2) return undefined;
  return capitalize(words[1]);
}

function buildObjectKey(categoria: string, subcategoria: string | undefined, codigo: string, ext: string): string {
  if (subcategoria) {
    return `${categoria}/${subcategoria}/${codigo}${ext}`;
  }
  return `${categoria}/${codigo}${ext}`;
}

function getMinioBase(): string {
  const host = window.location.hostname;
  for (const [domain, base] of Object.entries(TENANT_MINIO_MAP)) {
    if (host === domain || host.endsWith(`.${domain}`)) {
      return base;
    }
  }
  return '';
}

function buildUrl(minioBase: string, objectKey: string): string {
  return `${minioBase}/${BUCKET}/${objectKey}`;
}

async function objectExists(url: string): Promise<boolean> {
  if (typeof Image === 'undefined') return false;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

export interface MinioResult {
  url: string;
  objectKey: string;
  extension: string;
  found: boolean;
}

export async function resolveMinioImage(
  description: string,
  codigo: string
): Promise<MinioResult | null> {
  const minioBase = getMinioBase();
  if (!minioBase) return null;

  const categoria = extractCategory(description);
  const subcategoria = extractSubcategory(description);

  if (!categoria) return null;

  for (const ext of EXTENSIONS) {
    const objectKey = buildObjectKey(categoria, subcategoria, codigo, ext);
    const url = buildUrl(minioBase, objectKey);
    const exists = await objectExists(url);
    if (exists) {
      return { url, objectKey, extension: ext, found: true };
    }
  }

  return null;
}
