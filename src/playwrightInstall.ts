import * as child_process from 'child_process';

/** Browser names passed to "playwright install". Chromium set includes headless-shell and ffmpeg. */
export const CHROMIUM_INSTALL_NAMES = ['chromium', 'chromium-headless-shell', 'ffmpeg'] as const;

export const FIREFOX_INSTALL_NAMES = ['firefox'] as const;
export const WEBKIT_INSTALL_NAMES = ['webkit'] as const;

/** Default browsers to install on first activation (Chromium stack). */
export function getDefaultChromiumBrowsers(): string[] {
    return [...CHROMIUM_INSTALL_NAMES];
}

/**
 * Map user-facing choice to Playwright install names.
 * "chromium" -> chromium + chromium-headless-shell + ffmpeg; "firefox" -> firefox; "webkit" -> webkit.
 */
export function getInstallNamesForChoice(choice: string): string[] {
    switch (choice) {
        case 'chromium':
            return getDefaultChromiumBrowsers();
        case 'firefox':
            return [...FIREFOX_INSTALL_NAMES];
        case 'webkit':
            return [...WEBKIT_INSTALL_NAMES];
        default:
            return [];
    }
}

/**
 * Install Playwright browser binaries using "npx playwright install ...".
 * Uses default cache location (~/.cache/ms-playwright etc.) so browser-devtools-mcp finds them.
 */
export function installPlaywrightBrowsers(browserNames: string[]): Promise<void> {
    if (browserNames.length === 0) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const args = ['playwright', 'install', ...browserNames];
        const child = child_process.spawn('npx', args, {
            env: process.env,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const timeout = setTimeout(() => {
            child.kill('SIGTERM');
            reject(new Error('Install timed out after 10 minutes'));
        }, 600_000); // 10 min
        child.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
        child.on('close', (code, signal) => {
            clearTimeout(timeout);
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(signal ? `Install killed: ${signal}` : `Install exited with code ${code}`));
            }
        });
    });
}
