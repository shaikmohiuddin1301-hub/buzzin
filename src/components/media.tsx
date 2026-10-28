import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { Badge } from "@/components/ui";

/** Video player with captions. Never autoplays, never plays audio unrequested. */
export function VideoPlayer({
  src,
  captionsSrc,
  title,
  transcript,
}: {
  src: string;
  captionsSrc?: string | null;
  title: string;
  transcript?: string | null;
}) {
  return (
    <figure className="overflow-hidden rounded-xl border border-navy-200 ink-surface">
      <video controls preload="metadata" className="aspect-video w-full" aria-label={title}>
        <source src={src} />
        {captionsSrc ? <track kind="captions" src={captionsSrc} srcLang="en" label="English captions" default /> : null}
        Your browser does not support the video element.{" "}
        <a href={src} className="underline">
          Download the video
        </a>
        .
      </video>
      <figcaption className="flex items-center justify-between gap-3 bg-surface px-4 py-2.5 text-[12px] text-navy-600">
        <span>{title}</span>
        {!captionsSrc ? <Badge tone="warning">Captions not available</Badge> : <Badge tone="success">Captions available</Badge>}
      </figcaption>
      {transcript ? (
        <details className="border-t border-navy-200 bg-surface px-4 py-3">
          <summary className="cursor-pointer text-[12px] font-medium text-navy-700">Read the transcript</summary>
          <p className="mt-2 whitespace-pre-line text-[12.5px] leading-6 text-navy-600">{transcript}</p>
        </details>
      ) : null}
    </figure>
  );
}

export function AudioPlayer({ src, title }: { src: string; title: string }) {
  return (
    <figure className="rounded-lg border border-navy-200 bg-surface p-3">
      <figcaption className="mb-1.5 text-[12px] font-medium text-navy-700">{title}</figcaption>
      <audio controls preload="none" className="w-full">
        <source src={src} />
        Your browser does not support audio playback.
      </audio>
    </figure>
  );
}

export function AttachmentLink({
  fileId,
  filename,
  mimeType,
  sizeBytes,
  signed,
}: {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  signed?: string | null;
}) {
  const isImage = mimeType.startsWith("image/");
  const href = signed ?? `/api/files/${fileId}`;
  return (
    <div className="rounded-lg border border-navy-200 bg-surface">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={href} alt={filename} className="max-h-72 w-full rounded-t-lg object-contain" loading="lazy" />
      ) : null}
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 text-[12px] text-navy-700">
          <FileText size={14} aria-hidden="true" />
          <span className="truncate">{filename}</span>
          <span className="shrink-0 text-[10px] text-navy-400">{(sizeBytes / 1024).toFixed(0)} KB</span>
        </span>
        <Link href={href} className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline">
          <Download size={12} aria-hidden="true" />
          Open
        </Link>
      </div>
    </div>
  );
}
