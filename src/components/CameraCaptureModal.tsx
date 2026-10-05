import React, { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { ImageViewLabel } from "../types/triage";

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string, viewLabel: ImageViewLabel) => void;
  defaultViewLabel?: ImageViewLabel;
}

const VIEW_LABELS: ImageViewLabel[] = [
  "Front view",
  "Side view",
  "Close-up",
  "Comparison with an earlier image",
];

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  defaultViewLabel = "Front view",
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [selectedView, setSelectedView] = useState<ImageViewLabel>(defaultViewLabel);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [liveLuminance, setLiveLuminance] = useState<number>(135);

  useEffect(() => {
    setSelectedView(defaultViewLabel);
  }, [defaultViewLabel]);

  useEffect(() => {
    if (!isOpen) {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
      return;
    }

    let activeStream: MediaStream | null = null;
    let isCancelled = false;

    async function startCamera() {
      setCameraError(null);
      try {
        activeStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });
        if (isCancelled) {
          activeStream.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(activeStream);
        if (videoRef.current) {
          videoRef.current.srcObject = activeStream;
        }
      } catch (err: any) {
        setCameraError(
          err?.message ||
            "Camera access was unavailable or blocked in this browser frame. You can upload a photo or use the clinical sample photos instead."
        );
      }
    }

    startCamera();

    return () => {
      isCancelled = true;
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isOpen, facingMode]);

  // Sample real-time brightness every 700ms so user sees lighting guidance
  useEffect(() => {
    if (!isOpen || !stream) return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 48;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 64, 48);
      const { data } = ctx.getImageData(0, 0, 64, 48);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      setLiveLuminance(Math.round(sum / (64 * 48)));
    }, 700);
    return () => clearInterval(interval);
  }, [isOpen, stream]);

  if (!isOpen) return null;

  const handleSnap = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 960;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    onCapture(dataUrl, selectedView);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Capture Clinical First-Aid Photo
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Hold steady 15–25 cm from the affected area in even lighting. Avoid faces or ID badges.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            aria-label="Close camera modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Angle Tag Selector */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-600">Select Photo Angle / Purpose:</span>
            <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
              {VIEW_LABELS.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setSelectedView(label)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    selectedView === label
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Camera Viewport */}
          <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg bg-slate-950 border border-slate-800">
            {cameraError ? (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <AlertTriangle className="h-8 w-8 text-amber-400 mb-3" />
                <p className="text-sm font-medium text-white max-w-md">{cameraError}</p>
                <p className="text-xs text-slate-400 mt-2">
                  Close this dialog to upload an existing photo from your device or load one of the clinical sample photos.
                </p>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
                {/* Optical framing reticle */}
                <div className="pointer-events-none absolute inset-8 rounded-lg border border-dashed border-white/60 flex items-end justify-between p-3">
                  <span className="text-xs font-mono text-white/90 bg-slate-950/70 px-2.5 py-1 rounded-md">
                    Center affected area inside guide
                  </span>
                  <span className="text-xs font-mono text-white/90 bg-slate-950/70 px-2.5 py-1 rounded-md tabular-nums">
                    {liveLuminance < 45 ? (
                      <span className="text-amber-300 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" /> Low light ({liveLuminance})
                      </span>
                    ) : (
                      <span className="text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Good lighting ({liveLuminance})
                      </span>
                    )}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() =>
                setFacingMode((prev) => (prev === "environment" ? "user" : "environment"))
              }
              disabled={!!cameraError}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Switch Camera ({facingMode === "environment" ? "Rear" : "Front"})
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSnap}
                disabled={!!cameraError || !stream}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Camera className="h-3.5 w-3.5" />
                Capture Photo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
