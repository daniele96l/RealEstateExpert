#!/usr/bin/env npx tsx
/**
 * Open Immobiliare in a visible browser to solve DataDome captcha once.
 * Usage:
 *   IMMOBILIARE_BROWSER_HEADED=1 IMMOBILIARE_BROWSER_PROFILE=~/.immobiliare-browser \
 *     npm run immobiliare:captcha
 */
import { openBrowserForCaptcha } from "../lib/server/immobiliare-browser";

const url = process.argv[2] ?? "https://www.immobiliare.it/vendita-case/reggio-calabria/";

openBrowserForCaptcha(url).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
