// Where the scripts find Chrome and how it draws. On the Mac WebGL runs on the real GPU through Metal. Elsewhere (CI's
// Linux runners have no GPU), or with SOFTWARE_GL=1, it runs on the CPU with SwiftShader: fine for leaks and startup,
// meaningless for frame rates.
export const CHROME = process.env.CHROME
  ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
export const SOFTWARE_GL = process.platform !== 'darwin' || process.env.SOFTWARE_GL === '1';
// SwiftShader's WebGL fallback leaves Chrome's compositor on its normal path rather than using SwANGLE for everything.
export const GPU_ARGS = SOFTWARE_GL ? ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
