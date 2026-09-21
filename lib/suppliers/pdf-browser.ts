import fs from "node:fs";
import { launch, type Browser } from "puppeteer-core";

// Un solo Chromium reusado entre requests — el server de Next corre de forma
// larga bajo Docker Compose (no es una función serverless de un solo uso),
// así que relanzar el browser en cada PDF sería lento e innecesario. Si el
// browser muere (crash, OOM), se relanza solo en la siguiente llamada.
let browserPromise: Promise<Browser> | null = null;

function resolveExecutablePath(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  // Rutas típicas fuera de Docker, para poder probar esto en desarrollo local
  // (Mac/Linux) sin tener que levantar el contenedor — en producción SIEMPRE
  // debe venir de PUPPETEER_EXECUTABLE_PATH (ver Dockerfile: apt-get install
  // chromium + ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium).
  const candidates = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      "No se encontró un Chromium/Chrome instalado. Define PUPPETEER_EXECUTABLE_PATH " +
        "(en Docker: /usr/bin/chromium tras `apt-get install chromium`; en local: la ruta " +
        "a tu Chrome/Chromium instalado)."
    );
  }
  return found;
}

async function launchBrowser(): Promise<Browser> {
  return launch({
    executablePath: resolveExecutablePath(),
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
}

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  const browser = await browserPromise;
  if (!browser.connected) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}
