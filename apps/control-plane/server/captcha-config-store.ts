import {
  BlobPreconditionFailedError,
  get,
  put,
} from "@vercel/blob";
import {
  DEFAULT_CAPTCHA_CONFIG,
  normalizeCaptchaConfig,
  type CaptchaConfig,
} from "@whoize/captcha-core";

const CURRENT_CONFIG_PATH = "whoize/control-plane/config.json";
const AUDIT_PREFIX = "whoize/control-plane/audit";

export type ConfigSnapshot = {
  config: CaptchaConfig;
  storage: "blob" | "memory" | "default";
  updatedAt: string | null;
  updatedBy: string | null;
  etag: string | null;
};

type StoredConfig = {
  config: CaptchaConfig;
  updatedAt: string;
  updatedBy: string;
};

type RuntimeState = typeof globalThis & {
  __whoizeConfigSnapshot?: ConfigSnapshot;
};

const runtime = globalThis as RuntimeState;

export class ConfigRevisionConflictError extends Error {
  constructor(public readonly current: ConfigSnapshot) {
    super("Configuration was already changed in another session");
  }
}

function hasBlobStorage() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID),
  );
}

function defaultSnapshot(): ConfigSnapshot {
  return {
    config: DEFAULT_CAPTCHA_CONFIG,
    storage: hasBlobStorage() ? "default" : "memory",
    updatedAt: null,
    updatedBy: null,
    etag: null,
  };
}

async function parseBlobStream(stream: ReadableStream<Uint8Array>) {
  const value = (await new Response(stream).json()) as StoredConfig;
  return {
    config: normalizeCaptchaConfig(value.config),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    updatedBy: typeof value.updatedBy === "string" ? value.updatedBy : null,
  };
}

export async function readServerCaptchaConfig(): Promise<ConfigSnapshot> {
  if (!hasBlobStorage()) {
    return runtime.__whoizeConfigSnapshot ?? defaultSnapshot();
  }

  const result = await get(CURRENT_CONFIG_PATH, {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200) return defaultSnapshot();

  const stored = await parseBlobStream(result.stream);
  return {
    ...stored,
    storage: "blob",
    etag: result.blob.etag.replace(/^W\//, ""),
  };
}

export async function writeServerCaptchaConfig({
  value,
  expectedRevision,
  updatedBy,
}: {
  value: unknown;
  expectedRevision: number;
  updatedBy: string;
}): Promise<ConfigSnapshot> {
  const current = await readServerCaptchaConfig();
  if (current.config.revision !== expectedRevision) {
    throw new ConfigRevisionConflictError(current);
  }

  const now = new Date().toISOString();
  const nextConfig = normalizeCaptchaConfig({
    ...(value as Partial<CaptchaConfig>),
    revision: current.config.revision + 1,
  });
  const stored: StoredConfig = {
    config: nextConfig,
    updatedAt: now,
    updatedBy,
  };

  if (!hasBlobStorage()) {
    const nextSnapshot: ConfigSnapshot = {
      config: nextConfig,
      storage: "memory",
      updatedAt: now,
      updatedBy,
      etag: null,
    };
    runtime.__whoizeConfigSnapshot = nextSnapshot;
    return nextSnapshot;
  }

  try {
    const result = await put(CURRENT_CONFIG_PATH, JSON.stringify(stored), {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: "application/json",
      cacheControlMaxAge: 60,
      ...(current.etag ? { ifMatch: current.etag } : {}),
    });

    const auditPath = `${AUDIT_PREFIX}/${now.replaceAll(":", "-")}-r${nextConfig.revision}.json`;
    await put(auditPath, JSON.stringify(stored), {
      access: "private",
      addRandomSuffix: true,
      contentType: "application/json",
      cacheControlMaxAge: 60,
    });

    return {
      config: nextConfig,
      storage: "blob",
      updatedAt: now,
      updatedBy,
      etag: result.etag,
    };
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) {
      throw new ConfigRevisionConflictError(await readServerCaptchaConfig());
    }
    throw error;
  }
}
