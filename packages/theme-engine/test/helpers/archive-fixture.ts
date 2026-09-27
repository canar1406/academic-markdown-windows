import { execFileSync } from 'node:child_process';

/** Extract trusted repository test fixtures only, never user-supplied archives. */
export function extractArchiveFixture(archive: string, destination: string): void {
  switch (process.platform) {
    case 'win32':
      execFileSync('pwsh', [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
        // Expand-Archive internally treats brackets in the destination as a glob.
        // ZipFile's path API treats both inputs literally and keeps file bytes intact.
        "$ErrorActionPreference = 'Stop'; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:ACADEMIC_TEST_ARCHIVE, $env:ACADEMIC_TEST_DESTINATION)",
      ], {
        env: {
          ...process.env,
          ACADEMIC_TEST_ARCHIVE: archive,
          ACADEMIC_TEST_DESTINATION: destination,
        },
        stdio: 'pipe',
      });
      return;
    case 'darwin':
      execFileSync('/usr/bin/ditto', ['-x', '-k', archive, destination]);
      return;
    case 'linux':
      // Python's standard library honors ZIP Unicode names without relying on
      // unzip's build-specific encoding support. Linux test hosts need python3.
      execFileSync('python3', ['-m', 'zipfile', '-e', archive, destination]);
      return;
    default:
      throw new Error(`Archive fixtures do not support platform: ${process.platform}`);
  }
}
