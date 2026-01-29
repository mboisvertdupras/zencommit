import path from 'node:path';

export function getPlatformId() {
  const { platform, arch } = process;
  if (platform === 'linux' && arch === 'x64') {
    return 'linux-x64';
  }
  if (platform === 'darwin' && arch === 'x64') {
    return 'darwin-x64';
  }
  if (platform === 'darwin' && arch === 'arm64') {
    return 'darwin-arm64';
  }
  if (platform === 'win32' && arch === 'x64') {
    return 'win32-x64';
  }
  throw new Error(`Unsupported platform: ${platform} ${arch}`);
}

export function getBinaryName() {
  return process.platform === 'win32' ? 'zencommit.exe' : 'zencommit';
}

export function getAssetName(version) {
  const platformId = getPlatformId();
  const ext = process.platform === 'win32' ? '.exe' : '';
  return `zencommit-${version}-${platformId}${ext}`;
}

export function getInstallPath(pkgRoot) {
  const platformId = getPlatformId();
  const binaryName = getBinaryName();
  return path.join(pkgRoot, 'bin', platformId, binaryName);
}
