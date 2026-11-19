/**
 * Milestone 7 — small, atomic, self-hosted JSON database.
 *
 * This is a real persistent store for a single Node process: every mutation is
 * serialised and written through a temporary file + rename so a crash cannot
 * leave a half-written account file. It needs no external service or key, so
 * accounts work on a self-hosted server out of the box.
 *
 * A future PostgreSQL adapter can replace this module without changing the
 * router contracts.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const DB_VERSION = 1;

function emptyDatabase() {
  return {
    version: DB_VERSION,
    users: [],
    sessions: [],
    resets: [],
    progress: {},
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeLoaded(raw) {
  if (!isObject(raw)) throw new Error('Database root must be a JSON object.');
  if (raw.version !== DB_VERSION) {
    throw new Error(`Unsupported database version ${raw.version}. Expected ${DB_VERSION}.`);
  }
  for (const key of ['users', 'sessions', 'resets']) {
    if (!Array.isArray(raw[key])) throw new Error(`Database "${key}" must be an array.`);
  }
  if (!isObject(raw.progress)) throw new Error('Database "progress" must be an object.');
  return { ...emptyDatabase(), ...raw, version: DB_VERSION };
}

export async function createDatabase({ filePath } = {}) {
  if (!filePath) throw new Error('createDatabase requires a filePath.');
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let data;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    data = normalizeLoaded(JSON.parse(raw));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      data = emptyDatabase();
      await persist();
    } else {
      throw error;
    }
  }

  async function persist() {
    const target = path.resolve(filePath);
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temp, target);
  }

  // All writes go through one queue: no read/modify/write races between two
  // concurrent registrations, logins or sync pushes.
  let queue = Promise.resolve();
  function mutate(fn) {
    const run = queue.then(async () => {
      const result = await fn(data);
      await persist();
      return result;
    });
    queue = run.catch(() => {});
    return run;
  }

  const publicUser = (user) =>
    user ? { id: user.id, email: user.email, name: user.name || '', createdAt: user.createdAt } : null;

  return {
    filePath,

    getUserByEmail(email) {
      const normalized = String(email || '').trim().toLowerCase();
      return data.users.find((user) => user.email === normalized) || null;
    },

    getUserById(id) {
      return data.users.find((user) => user.id === id) || null;
    },

    createUser(record) {
      return mutate((store) => {
        if (store.users.some((user) => user.email === record.email)) {
          const error = new Error('An account with that email already exists.');
          error.code = 'email_taken';
          throw error;
        }
        const user = { ...record, createdAt: record.createdAt || new Date().toISOString() };
        store.users.push(user);
        return clone(publicUser(user));
      });
    },

    updateUserPassword(userId, passwordRecord) {
      return mutate((store) => {
        const user = store.users.find((item) => item.id === userId);
        if (!user) return false;
        user.passwordSalt = passwordRecord.salt;
        user.passwordHash = passwordRecord.hash;
        user.updatedAt = new Date().toISOString();
        return true;
      });
    },

    createSession(record) {
      return mutate((store) => {
        store.sessions = store.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
        store.sessions.push(record);
        return clone(record);
      });
    },

    getSession(tokenHash) {
      const session = data.sessions.find((item) => item.tokenHash === tokenHash);
      if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
      const user = data.users.find((item) => item.id === session.userId);
      return user ? { session: clone(session), user: clone(user) } : null;
    },

    deleteSession(id) {
      return mutate((store) => {
        const before = store.sessions.length;
        store.sessions = store.sessions.filter((session) => session.id !== id);
        return store.sessions.length !== before;
      });
    },

    deleteSessionsForUser(userId) {
      return mutate((store) => {
        store.sessions = store.sessions.filter((session) => session.userId !== userId);
        return true;
      });
    },

    createReset(record) {
      return mutate((store) => {
        const now = Date.now();
        // Only expired/used records are pruned globally. Valid tokens for other
        // users must survive a reset request for a different email.
        store.resets = store.resets.filter((item) => Date.parse(item.expiresAt) > now && !item.usedAt);
        store.resets.push(record);
        // Cap this user's outstanding tokens to the three most recent. The
        // insertion index breaks timestamp ties so rapid requests stay ordered.
        const forUser = store.resets.filter((item) => item.userId === record.userId);
        if (forUser.length > 3) {
          const recent = forUser
            .map((item, index) => ({ item, index, time: Date.parse(item.createdAt) || 0 }))
            .sort((a, b) => b.time - a.time || b.index - a.index)
            .slice(0, 3)
            .map((entry) => entry.item);
          const keep = new Set(recent.map((item) => item.id));
          store.resets = store.resets.filter(
            (item) => item.userId !== record.userId || keep.has(item.id),
          );
        }
        return clone(record);
      });
    },

    consumeReset({ userId, tokenHash }) {
      return mutate((store) => {
        const reset = store.resets.find(
          (item) =>
            item.userId === userId &&
            item.tokenHash === tokenHash &&
            !item.usedAt &&
            Date.parse(item.expiresAt) > Date.now(),
        );
        if (!reset) return false;
        reset.usedAt = new Date().toISOString();
        return true;
      });
    },

    // Consume a reset and apply the new password in one queued mutation, so a
    // later failure cannot burn the token without changing the password.
    resetPassword({ userId, tokenHash, passwordRecord }) {
      return mutate((store) => {
        const reset = store.resets.find(
          (item) =>
            item.userId === userId &&
            item.tokenHash === tokenHash &&
            !item.usedAt &&
            Date.parse(item.expiresAt) > Date.now(),
        );
        const user = store.users.find((item) => item.id === userId);
        if (!reset || !user) return false;
        const now = new Date().toISOString();
        reset.usedAt = now;
        user.passwordSalt = passwordRecord.salt;
        user.passwordHash = passwordRecord.hash;
        user.updatedAt = now;
        store.sessions = store.sessions.filter((session) => session.userId !== userId);
        return true;
      });
    },

    // A queued write that changes nothing. Used on the unknown-email reset path
    // so account existence is not revealed by a missing database write.
    noOpWrite() {
      return mutate(() => undefined);
    },

    getProgress(userId) {
      const record = data.progress[userId];
      return record ? clone(record) : null;
    },

    saveProgress(userId, record) {
      return mutate((store) => {
        const current = store.progress[userId];
        const next = {
          state: clone(record.state),
          revision: current ? current.revision + 1 : 1,
          updatedAt: new Date().toISOString(),
        };
        store.progress[userId] = next;
        return clone(next);
      });
    },

    // Atomic compare-and-set: the expected revision is checked inside the same
    // queued mutation that writes progress, so two concurrent pushes with the
    // same expectedRevision cannot both pass.
    saveProgressIfRevision(userId, record, expectedRevision) {
      return mutate((store) => {
        const current = store.progress[userId];
        const currentRevision = current?.revision || 0;
        if (
          expectedRevision !== null &&
          expectedRevision !== undefined &&
          expectedRevision !== currentRevision
        ) {
          return { conflict: true, revision: currentRevision, updatedAt: current?.updatedAt || null };
        }
        const next = {
          state: clone(record.state),
          revision: currentRevision + 1,
          updatedAt: new Date().toISOString(),
        };
        store.progress[userId] = next;
        return { conflict: false, revision: next.revision, updatedAt: next.updatedAt };
      });
    },

    deleteProgress(userId) {
      return mutate((store) => {
        delete store.progress[userId];
        return true;
      });
    },

    deleteAccount(userId) {
      return mutate((store) => {
        store.users = store.users.filter((user) => user.id !== userId);
        store.sessions = store.sessions.filter((session) => session.userId !== userId);
        store.resets = store.resets.filter((reset) => reset.userId !== userId);
        delete store.progress[userId];
        return true;
      });
    },

    stats() {
      return {
        users: data.users.length,
        sessions: data.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now()).length,
        progressRecords: Object.keys(data.progress).length,
      };
    },
  };
}
