/**
 * Resolves image paths that were written as "/src/assets/images/<name>" (which only exist on
 * the Vite dev server) to the hashed URLs Vite emits in a production build.
 *
 * Saved profiles still store the stable legacy path, so avatar selection keeps working across
 * deploys; only the rendered <img src> is translated. Data URLs, http(s) URLs and anything
 * else pass through untouched.
 */
const imageModules = import.meta.glob('../assets/images/*.{jpg,jpeg,png,webp,svg,gif}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const urlByFileName: Record<string, string> = {};
for (const [path, url] of Object.entries(imageModules)) {
  const name = path.split('/').pop();
  if (name) urlByFileName[name] = url;
}

const LEGACY_PREFIX = '/src/assets/images/';

export function resolveAssetUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith(LEGACY_PREFIX)) {
    const name = path.slice(LEGACY_PREFIX.length);
    return urlByFileName[name] ?? path;
  }
  return path;
}
