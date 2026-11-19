#!/usr/bin/env node
/**
 * Milestone 9 — self-hosted state backup.
 *
 * Copies the entire data directory (the atomic JSON database plus any local
 * session secret) into a timestamped, permission-restricted folder and keeps
 * only the newest N snapshots. This module never prints secret contents; it
 * reports only file names and sizes.
 *
 * Usage:
 *   node scripts/backup.mjs
 *   DATA_DIR=/srv/deutschlern/data BACKUP_DIR=/srv/deutschlern/backups \
 *     BACKUP_RETAIN=14 node scripts/backup.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), 'backups'));
const RETAIN = (() => {
  const parsed = Number(process.env.BACKUP_RETAIN);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 365 ? parsed : 7;
})();

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

async function main() {
  let sourceFiles;
  try {
    sourceFiles = await listFiles(DATA_DIR);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.error(`[backup] No data directory at ${DATA_DIR}; nothing to back up.`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  if (sourceFiles.length === 0) {
    console.error('[backup] The data directory is empty; refusing to create an empty snapshot.');
    process.exitCode = 1;
    return;
  }

  await fs.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const target = path.join(BACKUP_DIR, `backup-${stamp()}`);
  await fs.mkdir(target, { recursive: true, mode: 0o700 });

  let totalBytes = 0;
  for (const file of sourceFiles) {
    const relative = path.relative(DATA_DIR, file);
    const destination = path.join(target, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await fs.copyFile(file, destination);
    await fs.chmod(destination, 0o600);
    const { size } = await fs.stat(destination);
    totalBytes += size;
    console.log(`  + ${relative} (${size} bytes)`);
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    source: DATA_DIR,
    fileCount: sourceFiles.length,
    totalBytes,
    version: '1',
  };
  await fs.writeFile(path.join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });

  const snapshots = (await fs.readdir(BACKUP_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('backup-'))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const old of snapshots.slice(RETAIN)) {
    await fs.rm(path.join(BACKUP_DIR, old), { recursive: true, force: true });
    console.log(`  - rotated ${old}`);
  }

  console.log(`[backup] Snapshot ready: ${target}`);
  console.log(`[backup] ${sourceFiles.length} files, ${totalBytes} bytes; keeping ${Math.min(RETAIN, snapshots.length)} snapshots.`);
}

main().catch((error) => {
  console.error('[backup] Failed:', error.message);
  process.exitCode = 1;
});
