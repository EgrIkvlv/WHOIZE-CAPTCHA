import {
  BlobPreconditionFailedError,
  get,
  put,
} from "@vercel/blob";

type D1Result = { meta?: { changes?: number } };
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<D1Result>;
};
type D1DatabaseLike = {
  prepare(query: string): D1Statement;
};

type RuntimeState = typeof globalThis & {
  __whoizeCaptchaDb?: D1DatabaseLike;
  __whoizeCaptchaRecords?: Map<
    string,
    { value: unknown; version: number; expiresAt: number }
  >;
  __whoizeCaptchaDbReady?: Promise<void>;
};

const runtime = globalThis as RuntimeState;
const BLOB_PREFIX = "whoize/server-captcha";

function strongEtag(etag: string) {
  return etag.startsWith("W/") ? etag.slice(2) : etag;
}

export type StoredRecord<T> = {
  value: T;
  version: string;
  storage: "d1" | "blob" | "memory";
};

export class RecordConflictError extends Error {
  constructor() {
    super("Record changed concurrently");
  }
}

function hasBlobStorage() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID),
  );
}

function memoryRecords() {
  runtime.__whoizeCaptchaRecords ??= new Map();
  return runtime.__whoizeCaptchaRecords;
}

async function ensureD1() {
  const db = runtime.__whoizeCaptchaDb;
  if (!db) return null;
  runtime.__whoizeCaptchaDbReady ??= db
    .prepare(
      "CREATE TABLE IF NOT EXISTS whoize_captcha_records (record_key TEXT PRIMARY KEY, value TEXT NOT NULL, revision INTEGER NOT NULL, expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    )
    .run()
    .then(() => undefined);
  await runtime.__whoizeCaptchaDbReady;
  return db;
}

export async function readRecord<T>(
  key: string,
  now = Date.now(),
): Promise<StoredRecord<T> | null> {
  const db = await ensureD1();
  if (db) {
    const row = await db
      .prepare(
        "SELECT value, revision, expires_at AS expiresAt FROM whoize_captcha_records WHERE record_key = ?",
      )
      .bind(key)
      .first<{ value: string; revision: number; expiresAt: number }>();
    if (!row || row.expiresAt <= now) return null;
    return {
      value: JSON.parse(row.value) as T,
      version: String(row.revision),
      storage: "d1",
    };
  }

  if (hasBlobStorage()) {
    const result = await get(`${BLOB_PREFIX}/${key}.json`, {
      access: "private",
      useCache: false,
    });
    if (!result || result.statusCode !== 200) return null;
    const payload = (await new Response(result.stream).json()) as {
      value: T;
      expiresAt: number;
    };
    if (payload.expiresAt <= now) return null;
    return {
      value: payload.value,
      // Private Blob downloads can expose the same content hash as a weak
      // HTTP ETag. Conditional writes require its strong representation.
      version: strongEtag(result.blob.etag),
      storage: "blob",
    };
  }

  const record = memoryRecords().get(key);
  if (!record || record.expiresAt <= now) {
    if (record) memoryRecords().delete(key);
    return null;
  }
  return {
    value: record.value as T,
    version: String(record.version),
    storage: "memory",
  };
}

export async function writeRecord<T>({
  key,
  value,
  expiresAt,
  expectedVersion,
}: {
  key: string;
  value: T;
  expiresAt: number;
  expectedVersion?: string;
}): Promise<StoredRecord<T>> {
  const db = await ensureD1();
  if (db) {
    const nextRevision = expectedVersion
      ? Number(expectedVersion) + 1
      : 1;
    const statement = expectedVersion
      ? db
          .prepare(
            "UPDATE whoize_captcha_records SET value = ?, revision = ?, expires_at = ?, updated_at = ? WHERE record_key = ? AND revision = ?",
          )
          .bind(
            JSON.stringify(value),
            nextRevision,
            expiresAt,
            Date.now(),
            key,
            Number(expectedVersion),
          )
      : db
          .prepare(
            "INSERT INTO whoize_captcha_records (record_key, value, revision, expires_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(record_key) DO NOTHING",
          )
          .bind(
            key,
            JSON.stringify(value),
            nextRevision,
            expiresAt,
            Date.now(),
          );
    const result = await statement.run();
    if (!result.meta?.changes) throw new RecordConflictError();
    return {
      value,
      version: String(nextRevision),
      storage: "d1",
    };
  }

  if (hasBlobStorage()) {
    try {
      const result = await put(
        `${BLOB_PREFIX}/${key}.json`,
        JSON.stringify({ value, expiresAt }),
        {
          access: "private",
          allowOverwrite: true,
          addRandomSuffix: false,
          contentType: "application/json",
          cacheControlMaxAge: 60,
          ...(expectedVersion ? { ifMatch: expectedVersion } : {}),
        },
      );
      return { value, version: result.etag, storage: "blob" };
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) {
        throw new RecordConflictError();
      }
      throw error;
    }
  }

  const records = memoryRecords();
  const current = records.get(key);
  if (
    (expectedVersion && String(current?.version) !== expectedVersion) ||
    (!expectedVersion && current)
  ) {
    throw new RecordConflictError();
  }
  const version = (current?.version ?? 0) + 1;
  records.set(key, { value, version, expiresAt });
  return { value, version: String(version), storage: "memory" };
}
