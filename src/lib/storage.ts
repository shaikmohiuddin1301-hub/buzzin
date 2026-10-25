import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  conversationMembers,
  mediaFiles,
  messages,
  projectMembers,
  taskAssignments,
  type MediaFile,
} from "@/db/schema";
import { env } from "@/lib/env";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { hmac, safeEqual } from "@/lib/password";
import type { Visibility } from "@/lib/types";
import type { Viewer } from "@/lib/authz";

/**
 * Storage adapter interface. `local` writes to a private folder that is only
 * readable through an authorised route handler; `s3` is a documented seam for a
 * real object store and throws until configured.
 */
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

class LocalStorageAdapter implements StorageAdapter {
  private readonly root = path.resolve(process.cwd(), env.storageDir);

  private resolveKey(key: string): string {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(this.root + path.sep)) throw new AppError("Invalid storage key.", { status: 400 });
    return target;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.resolveKey(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.resolveKey(key));
    } catch {
      throw new NotFoundError("File not found.");
    }
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.resolveKey(key), { force: true });
  }
}

class UnconfiguredS3Adapter implements StorageAdapter {
  private fail(): never {
    throw new AppError(
      "Object storage is not configured. Set STORAGE_DRIVER=local or provide S3 credentials (see docs/DEPLOYMENT.md).",
      { status: 501, code: "storage_not_configured" },
    );
  }
  async put(): Promise<void> {
    this.fail();
  }
  async get(): Promise<Buffer> {
    this.fail();
  }
  async remove(): Promise<void> {
    this.fail();
  }
}

export function storage(): StorageAdapter {
  return env.storageDriver === "s3" ? new UnconfiguredS3Adapter() : new LocalStorageAdapter();
}

const EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "audio/mpeg": ".mp3",
  "audio/webm": ".webm",
  "audio/wav": ".wav",
  "video/mp4": ".mp4",
  "image/svg+xml": ".svg",
};

/** Refuse files whose bytes do not match the declared type. */
function sniffMatches(mime: string, buffer: Buffer): boolean {
  const hex = buffer.subarray(0, 12).toString("hex");
  switch (mime) {
    case "image/png":
      return hex.startsWith("89504e47");
    case "image/jpeg":
      return hex.startsWith("ffd8ff");
    case "image/gif":
      return hex.startsWith("47494638");
    case "image/webp":
      return hex.startsWith("52494646") && buffer.subarray(8, 12).toString() === "WEBP";
    case "application/pdf":
      return buffer.subarray(0, 5).toString() === "%PDF-";
    case "audio/mpeg":
      return hex.startsWith("494433") || hex.startsWith("fffb") || hex.startsWith("fff3");
    case "video/mp4":
      return buffer.subarray(4, 8).toString() === "ftyp";
    default:
      return true; // text and container formats are validated by extension policy
  }
}

export function sanitiseFilename(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
}

export type SaveMediaInput = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  ownerId: string | null;
  projectId?: string | null;
  taskId?: string | null;
  visibility?: Visibility;
};

export async function saveMedia(input: SaveMediaInput): Promise<MediaFile> {
  if (!env.allowedUploadTypes.includes(input.mimeType)) {
    throw new AppError(`Files of type ${input.mimeType} are not allowed.`, { status: 415, code: "unsupported_type" });
  }
  const limit = env.maxUploadMb * 1024 * 1024;
  if (input.buffer.byteLength === 0) throw new AppError("The uploaded file is empty.");
  if (input.buffer.byteLength > limit) {
    throw new AppError(`Files must be ${env.maxUploadMb}MB or smaller.`, { status: 413, code: "too_large" });
  }
  if (!sniffMatches(input.mimeType, input.buffer)) {
    throw new AppError("The file contents do not match its declared type.", { status: 415, code: "type_mismatch" });
  }

  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}${
    EXTENSIONS[input.mimeType] ?? ""
  }`;
  await storage().put(key, input.buffer);

  const row = {
    id: randomUUID(),
    ownerId: input.ownerId,
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
    storageKey: key,
    filename: sanitiseFilename(input.filename),
    mimeType: input.mimeType,
    sizeBytes: input.buffer.byteLength,
    checksum: createHash("sha256").update(input.buffer).digest("hex"),
    visibility: input.visibility ?? "private",
    createdAt: new Date().toISOString(),
  } satisfies typeof mediaFiles.$inferInsert;

  getDb().insert(mediaFiles).values(row).run();
  return row as MediaFile;
}

export async function saveUploadedFile(
  file: File,
  meta: { ownerId: string; projectId?: string | null; taskId?: string | null; visibility?: Visibility },
): Promise<MediaFile> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return saveMedia({
    buffer,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    ownerId: meta.ownerId,
    projectId: meta.projectId,
    taskId: meta.taskId,
    visibility: meta.visibility,
  });
}

/**
 * Persist platform-generated media (animated explainer exports, thumbnails).
 * Internal only: it deliberately skips the user-upload type policy because the
 * bytes are produced by our own renderer, not supplied by a browser.
 */
export async function saveGeneratedMedia(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  ownerId: string | null;
  projectId?: string | null;
  taskId?: string | null;
  visibility?: Visibility;
}): Promise<MediaFile> {
  const now = new Date();
  const key = `generated/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}${
    EXTENSIONS[input.mimeType] ?? ""
  }`;
  await storage().put(key, input.buffer);
  const row = {
    id: randomUUID(),
    ownerId: input.ownerId,
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
    storageKey: key,
    filename: sanitiseFilename(input.filename),
    mimeType: input.mimeType,
    sizeBytes: input.buffer.byteLength,
    checksum: createHash("sha256").update(input.buffer).digest("hex"),
    visibility: input.visibility ?? "private",
    createdAt: new Date().toISOString(),
  } satisfies typeof mediaFiles.$inferInsert;
  getDb().insert(mediaFiles).values(row).run();
  return row as MediaFile;
}

export async function readMedia(file: MediaFile): Promise<Buffer> {
  return storage().get(file.storageKey);
}

export function getMedia(fileId: string): MediaFile | null {
  return getDb().select().from(mediaFiles).where(eq(mediaFiles.id, fileId)).get() ?? null;
}

/** Authorisation for private file reads. */
export function canAccessMedia(file: MediaFile, viewer: Viewer): boolean {
  if (file.visibility === "public") return true;
  if (!viewer) return false;
  if (file.ownerId === viewer.id) return true;

  if (file.projectId) {
    const member = getDb()
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, file.projectId),
          eq(projectMembers.userId, viewer.id),
          eq(projectMembers.status, "active"),
        ),
      )
      .get();
    if (member) return true;
  }

  if (file.taskId) {
    const assignment = getDb()
      .select({ id: taskAssignments.id })
      .from(taskAssignments)
      .where(
        and(
          eq(taskAssignments.taskId, file.taskId),
          eq(taskAssignments.userId, viewer.id),
          eq(taskAssignments.status, "active"),
        ),
      )
      .get();
    if (assignment) return true;
  }

  // Chat attachments are readable by members of the conversation the message
  // belongs to, and by nobody else.
  const message = getDb().select().from(messages).where(eq(messages.attachmentId, file.id)).get();
  if (message) {
    const member = getDb()
      .select()
      .from(conversationMembers)
      .where(
        and(eq(conversationMembers.conversationId, message.conversationId), eq(conversationMembers.userId, viewer.id)),
      )
      .get();
    if (member && !member.removedAt) return true;
  }

  return false;
}

export function assertCanAccessMedia(file: MediaFile, viewer: Viewer): void {
  if (!canAccessMedia(file, viewer)) throw new ForbiddenError("You do not have access to this file.");
}

/**
 * Time-limited signed URL for embedding private media (e.g. <img src>).
 * The signature covers the file id and expiry, so it cannot be reused for
 * another file or extended.
 */
export function signedMediaUrl(fileId: string, ttlSeconds = 900): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = hmac(env.sessionSecret, `${fileId}.${expires}`);
  return `/api/files/${fileId}?expires=${expires}&signature=${signature}`;
}

export function verifyMediaSignature(fileId: string, expires: string, signature: string): boolean {
  const expiry = Number.parseInt(expires, 10);
  if (!Number.isFinite(expiry) || expiry * 1000 < Date.now()) return false;
  const expected = hmac(env.sessionSecret, `${fileId}.${expiry}`);
  return safeEqual(signature, expected);
}

/** Public URL helper used by components; private media gets a signed URL. */
export function mediaUrl(fileId: string | null | undefined, options: { isPublic?: boolean } = {}): string | null {
  if (!fileId) return null;
  return options.isPublic ? `/api/files/${fileId}` : signedMediaUrl(fileId);
}
