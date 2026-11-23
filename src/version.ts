declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
export const APP_COMMIT: string = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'dev';

/** Human-readable version, e.g. "0.1.0 (a1b2c3d)". */
export const VERSION_LABEL = `${APP_VERSION} (${APP_COMMIT})`;
