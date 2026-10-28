"use client";

import { Camera, ImagePlus, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";

/**
 * The photo field for a post: "Take photo" and "Choose from gallery".
 *
 * Two explicit actions rather than one ambiguous file input, because a phone shows
 * a different sheet for each and the person should not have to guess which one they
 * will get.
 *
 * Camera: a live preview through `getUserMedia` where the browser and this origin
 * support it (Android Chrome, desktop, and iOS Safari 14.3+ over HTTPS). Permission
 * is requested only when Take photo is pressed — never when the form opens. If the
 * camera is unavailable, blocked, or the API is missing, the same button falls back
 * to the operating system's camera capture (`<input capture="environment">`), which
 * opens the device camera app on iOS and Android without any page permission.
 *
 * The captured frame becomes a real JPEG File and is written into the form's file
 * input through a DataTransfer, so it is submitted with the form exactly like a
 * gallery selection. Nothing is uploaded from here: the server action stores it.
 */
export function ImagePicker({
  name,
  id,
  label,
  hint,
  maxMb,
  className,
}: {
  name: string;
  id: string;
  label: string;
  hint?: string;
  maxMb: number;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const captureRef = useRef<HTMLButtonElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxBytes = maxMb * 1024 * 1024;

  // Object URLs are revoked whenever the preview changes or the component
  // unmounts; a captured photo is never left pointing at a stale blob.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const releaseCamera = () => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  };

  useEffect(() => releaseCamera, []);

  // The preview element only exists after `cameraOpen` renders. Attaching the
  // stream in an effect (rather than one animation frame after the click) means a
  // slow first paint cannot lose the stream and leave a black dialog.
  useEffect(() => {
    if (!cameraOpen) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => setError("The camera preview could not start. Try again."));
  }, [cameraOpen]);

  useEffect(() => {
    if (!cameraOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCamera();
    };
    document.addEventListener("keydown", onKey);
    captureRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen]);

  /** Accept a chosen or captured file, with the same checks the server applies. */
  const accept = (candidate: File | null | undefined) => {
    if (!candidate) return;
    if (!candidate.type.startsWith("image/")) {
      setError("That file is not an image. Choose a PNG, JPEG or WebP picture.");
      return;
    }
    if (candidate.size === 0) {
      setError("That image is empty. Try taking the photo again.");
      return;
    }
    if (candidate.size > maxBytes) {
      setError(`Images must be ${maxMb}MB or smaller. Choose a smaller one or take a new photo.`);
      return;
    }
    const input = inputRef.current;
    if (input) {
      const transfer = new DataTransfer();
      transfer.items.add(candidate);
      input.files = transfer.files;
    }
    setError(null);
    setFile(candidate);
  };

  const clear = () => {
    if (inputRef.current) inputRef.current.value = "";
    setFile(null);
    setError(null);
  };

  const openGallery = () => {
    const input = inputRef.current;
    if (!input) return;
    input.removeAttribute("capture");
    input.click();
  };

  /** No live camera: let the operating system open its camera app instead. */
  const openNativeCamera = () => {
    const input = inputRef.current;
    if (!input) return;
    input.setAttribute("capture", "environment");
    input.click();
  };

  const openCamera = async () => {
    setError(null);
    const supported =
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      typeof DataTransfer !== "undefined";
    if (!supported) {
      // Camera app fallback: no permission prompt on this page at all.
      openNativeCamera();
      return;
    }
    try {
      // A second click while the permission prompt is open must not replace a
      // stream that is already being tracked (the old one would never be stopped).
      if (streamRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (streamRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      setCameraOpen(true);
    } catch (cause) {
      const reason = cause instanceof DOMException ? cause.name : "";
      if (reason === "NotAllowedError" || reason === "SecurityError") {
        setError("Camera access was blocked. Allow it in your browser settings and try again, or choose a photo from your gallery.");
      } else if (reason === "NotFoundError" || reason === "OverconstrainedError") {
        setError("No camera was found on this device. Choose a photo from your gallery instead.");
      } else {
        setError("The camera could not be opened. Choose a photo from your gallery instead.");
      }
      releaseCamera();
    }
  };

  const closeCamera = () => {
    releaseCamera();
    setCameraOpen(false);
    setCameraReady(false);
    triggerRef.current?.focus();
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError("The camera is still starting. Wait a moment and try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("This browser cannot capture the photo. Choose one from your gallery instead.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("The photo could not be prepared. Try again.");
          return;
        }
        accept(new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
        closeCamera();
      },
      "image/jpeg",
      0.9,
    );
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <span className="block text-sm font-medium text-navy-800">
        {label}
      </span>
      {/* The real form field. `capture` is set only for the camera-app fallback. */}
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label={label}
        className="sr-only"
        onChange={(event) => accept(event.target.files?.[0])}
      />

      {previewUrl ? (
        <div className="rounded-xl border border-navy-200 bg-navy-50/60 p-3">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="" className="h-28 w-28 rounded-lg border border-navy-200 object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-navy-800">{file?.name}</p>
              <p className="text-[11px] text-navy-500">
                {file ? `${(file.size / 1024 / 1024).toFixed(1)}MB · ` : ""}ready to publish with the post
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void openCamera()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-surface px-2.5 py-1.5 text-[12px] font-medium text-navy-700 hover:bg-navy-50"
                >
                  <RefreshCw size={13} aria-hidden="true" /> Retake
                </button>
                <button
                  type="button"
                  onClick={openGallery}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-surface px-2.5 py-1.5 text-[12px] font-medium text-navy-700 hover:bg-navy-50"
                >
                  <ImagePlus size={13} aria-hidden="true" /> Replace
                </button>
                <button
                  type="button"
                  onClick={clear}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-surface px-2.5 py-1.5 text-[12px] font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={13} aria-hidden="true" /> Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => void openCamera()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px] font-medium text-navy-800 hover:bg-navy-50"
          >
            <Camera size={14} aria-hidden="true" /> Take photo
          </button>
          <button
            type="button"
            onClick={openGallery}
            className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px] font-medium text-navy-800 hover:bg-navy-50"
          >
            <ImagePlus size={14} aria-hidden="true" /> Choose from gallery
          </button>
        </div>
      )}

      {hint && !error ? <p className="text-xs text-navy-500">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}

      {cameraOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Take photo">
          <div className="glass-popover w-full max-w-lg rounded-2xl p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-navy-950">Take photo</p>
              <button
                type="button"
                onClick={closeCamera}
                aria-label="Cancel camera"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-navy-600 hover:bg-navy-100"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                aria-label="Camera preview"
                onCanPlay={() => setCameraReady(true)}
                className="max-h-[60vh] w-full object-contain"
              />
              {!cameraReady ? (
                <p className="absolute inset-0 flex items-center justify-center text-[12px] text-white/80">
                  Starting the camera…
                </p>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                ref={captureRef}
                type="button"
                onClick={capture}
                className="inline-flex items-center gap-1.5 rounded-lg create-glow px-3.5 py-2 text-[12.5px] font-semibold"
              >
                <Camera size={14} aria-hidden="true" /> Capture photo
              </button>
              <button
                type="button"
                onClick={closeCamera}
                className="rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px] font-medium text-navy-700 hover:bg-navy-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  closeCamera();
                  openGallery();
                }}
                className="text-[12px] font-medium text-navy-500 underline"
              >
                Choose from gallery instead
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
