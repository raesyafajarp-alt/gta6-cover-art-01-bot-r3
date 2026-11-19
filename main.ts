// Vice Coast — a GTA-style cover art maker (program/v1, Node 22, stdlib only).
//
// The app is plain static files under app/ (index.html plus its ES-free
// classic scripts, styles, OFL fonts and sample photos) that any static
// server can serve with no network. This program hands the entry in: it
// copies app/ and screenshots/ from beside this file into /output and
// writes /output/dossier.json with the kit's vendored library, exactly as
// the kit's starter does. Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The gate's own caps: keep the dossier text under 160 KiB, at most four
// screenshots of 256 KiB each, app/ under 993 entries and 48 MiB in all.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);
