import React, { useEffect, useRef, useState } from "react";
import {
  Volume2,
  Film,
  Download,
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { MediaStoryboard, SelectedContentItem } from "../types/triage";

interface MediaCreationStudioProps {
  selectedItems: SelectedContentItem[];
  activeItem: SelectedContentItem | null;
  onSelectItem: (item: SelectedContentItem) => void;
  onAddCustomSelection: (title: string, text: string) => void;
  patientPreviewImage?: string;
}

const VOICE_OPTIONS = [
  { id: "Kore", label: "Kore — Calm Clinical Educator" },
  { id: "Zephyr", label: "Zephyr — Warm & Reassuring" },
  { id: "Charon", label: "Charon — Direct & Measured" },
  { id: "Fenrir", label: "Fenrir — Steady First-Responder" },
  { id: "Puck", label: "Puck — Clear & Articulate" },
];

export const MediaCreationStudio: React.FC<MediaCreationStudioProps> = ({
  selectedItems,
  activeItem,
  onSelectItem,
  onAddCustomSelection,
  patientPreviewImage,
}) => {
  const [selectedVoice, setSelectedVoice] = useState<string>("Kore");
  const [editableContent, setEditableContent] = useState<string>("");
  const [editableTitle, setEditableTitle] = useState<string>("");

  // Audio state
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Video state
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [storyboard, setStoryboard] = useState<MediaStoryboard | null>(null);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [activeSceneIndex, setActiveSceneIndex] = useState<number>(0);
  const [isPlayingCanvas, setIsPlayingCanvas] = useState<boolean>(false);
  const [isRecordingWebM, setIsRecordingWebM] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedPatientImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (activeItem) {
      setEditableTitle(activeItem.title);
      setEditableContent(activeItem.content);
    }
  }, [activeItem]);

  useEffect(() => {
    if (!patientPreviewImage) {
      loadedPatientImgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      loadedPatientImgRef.current = img;
    };
    img.src = patientPreviewImage;
  }, [patientPreviewImage]);

  // Draw the current scene onto the HTML5 canvas for live preview and WebM video recording
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Background slate canvas
    ctx.fillStyle = "#0F172A";
    ctx.fillRect(0, 0, W, H);

    // Top bar inside video frame
    ctx.fillStyle = "#1E293B";
    ctx.fillRect(0, 0, W, 58);

    ctx.fillStyle = "#F8FAFC";
    ctx.font = "600 16px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(
      storyboard?.videoTitle || editableTitle || "Clarion First-Aid Visual Walkthrough",
      28,
      35
    );

    const sceneCount = storyboard?.scenes?.length || 1;
    const currentScene = storyboard?.scenes?.[activeSceneIndex] || {
      sceneNumber: 1,
      heading: editableTitle || "Selected Care Guidance",
      keyBullet: editableContent.slice(0, 180) || "Select content from the assessment to generate an audio or video guide.",
      cautionCallout: "For informational first-aid guidance only — not a medical diagnosis.",
      durationSeconds: 5,
      visualIconType: "cleanse" as const,
    };

    // Scene step counter on top right
    ctx.fillStyle = "#94A3B8";
    ctx.font = "500 13px 'JetBrains Mono', monospace";
    const stepText = `SCENE 0${currentScene.sceneNumber} / 0${sceneCount}`;
    ctx.fillText(stepText, W - 145, 35);

    // Left column: Patient reference image or clinical schematic card
    const cardX = 28;
    const cardY = 82;
    const cardW = 240;
    const cardH = 220;

    ctx.fillStyle = "#1E293B";
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.strokeRect(cardX, cardY, cardW, cardH);

    if (loadedPatientImgRef.current) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cardX + 8, cardY + 8, cardW - 16, cardH - 44);
      ctx.clip();
      ctx.drawImage(
        loadedPatientImgRef.current,
        cardX + 8,
        cardY + 8,
        cardW - 16,
        cardH - 44
      );
      ctx.restore();
    } else {
      ctx.fillStyle = "#334155";
      ctx.fillRect(cardX + 12, cardY + 12, cardW - 24, cardH - 52);
      ctx.fillStyle = "#94A3B8";
      ctx.font = "500 12px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText("Visual Care Step Guide", cardX + 54, cardY + 100);
    }

    ctx.fillStyle = "#CBD5E1";
    ctx.font = "500 11px 'JetBrains Mono', monospace";
    ctx.fillText(`STEP 0${currentScene.sceneNumber} · ${currentScene.visualIconType.toUpperCase()}`, cardX + 12, cardY + cardH - 14);

    // Right column: Heading + Key Care Instruction + Caution Note
    const textX = 292;
    const maxTextW = W - textX - 32;

    ctx.fillStyle = "#38BDF8";
    ctx.font = "600 12px 'JetBrains Mono', monospace";
    ctx.fillText(`CARE ACTION STEP 0${currentScene.sceneNumber}`, textX, 104);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "700 22px 'Plus Jakarta Sans', sans-serif";
    wrapCanvasText(ctx, currentScene.heading, textX, 136, maxTextW, 28);

    ctx.fillStyle = "#E2E8F0";
    ctx.font = "400 15px 'Plus Jakarta Sans', sans-serif";
    wrapCanvasText(ctx, currentScene.keyBullet, textX, 196, maxTextW, 23);

    // Bottom caution bar
    ctx.fillStyle = "#1E293B";
    ctx.fillRect(28, H - 72, W - 56, 48);
    ctx.strokeStyle = "#475569";
    ctx.strokeRect(28, H - 72, W - 56, 48);

    ctx.fillStyle = "#FBBF24";
    ctx.font = "600 12px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText("Safety Note:", 42, H - 43);

    ctx.fillStyle = "#F1F5F9";
    ctx.font = "400 12px 'Plus Jakarta Sans', sans-serif";
    const cautionClipped =
      currentScene.cautionCallout.length > 92
        ? currentScene.cautionCallout.slice(0, 92) + "..."
        : currentScene.cautionCallout;
    ctx.fillText(cautionClipped, 124, H - 43);
  }, [storyboard, activeSceneIndex, editableTitle, editableContent, patientPreviewImage]);

  // Automatic scene progression when playing video walkthrough
  useEffect(() => {
    if (!isPlayingCanvas || !storyboard?.scenes?.length) return;
    const currentDur = (storyboard.scenes[activeSceneIndex]?.durationSeconds || 4) * 1000;
    const timer = setTimeout(() => {
      if (activeSceneIndex < storyboard.scenes.length - 1) {
        setActiveSceneIndex((prev) => prev + 1);
      } else {
        setIsPlayingCanvas(false);
      }
    }, currentDur);
    return () => clearTimeout(timer);
  }, [isPlayingCanvas, activeSceneIndex, storyboard]);

  const handleGenerateAudio = async () => {
    if (!editableContent.trim()) return;
    setIsGeneratingAudio(true);
    setAudioError(null);
    try {
      const res = await fetch("/api/generate-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText: `${editableTitle}. ${editableContent}`,
          voiceName: selectedVoice,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate audio narration");
      }
      setAudioDataUrl(data.audioDataUrl);
    } catch (err: any) {
      setAudioError(err?.message || "Could not synthesize speech.");
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleGenerateVideoGuide = async () => {
    if (!editableContent.trim()) return;
    setIsGeneratingVideo(true);
    setVideoError(null);
    setVideoBlobUrl(null);
    try {
      const res = await fetch("/api/generate-media-storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedTitle: editableTitle,
          selectedContent: editableContent,
          urgencyLevel: activeItem?.urgencyLevel || "low",
        }),
      });
      const sbData: MediaStoryboard = await res.json();
      if (!res.ok) {
        throw new Error((sbData as any).error || "Failed to build video storyboard");
      }
      setStoryboard(sbData);
      setActiveSceneIndex(0);

      // Also generate synchronized TTS voiceover for the video script
      const ttsRes = await fetch("/api/generate-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText: sbData.fullNarrationScript || editableContent,
          voiceName: selectedVoice,
        }),
      });
      if (ttsRes.ok) {
        const ttsData = await ttsRes.json();
        setAudioDataUrl(ttsData.audioDataUrl);
      }

      setIsPlayingCanvas(true);
    } catch (err: any) {
      setVideoError(err?.message || "Could not create video walkthrough.");
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  // Record the animated canvas walkthrough into a downloadable .webm video file
  const handleRecordDownloadableVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !storyboard?.scenes?.length) return;
    setIsRecordingWebM(true);
    setVideoBlobUrl(null);
    try {
      const stream = canvas.captureStream(30);
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm",
      });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      const stoppedPromise = new Promise<string>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: "video/webm" });
          resolve(URL.createObjectURL(blob));
        };
      });

      recorder.start();

      for (let i = 0; i < storyboard.scenes.length; i++) {
        setActiveSceneIndex(i);
        await new Promise((r) => setTimeout(r, 1800));
      }

      recorder.stop();
      const url = await stoppedPromise;
      setVideoBlobUrl(url);
    } catch (err: any) {
      setVideoError(err?.message || "Browser video recording is unavailable.");
    } finally {
      setIsRecordingWebM(false);
    }
  };

  const handleCaptureBrowserSelection = () => {
    const sel = window.getSelection()?.toString()?.trim();
    if (sel && sel.length > 5) {
      onAddCustomSelection("Highlighted Assessment Excerpt", sel);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Selected Content Audio & Video Care Studio
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Select any section from your AI assessment, first-aid steps, warning signs, or timeline comparison (or highlight any text on screen) to create a spoken audio guide (.wav) and a step-by-step instructional video (.webm).
          </p>
        </div>

        <button
          type="button"
          onClick={handleCaptureBrowserSelection}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
        >
          <FileText className="h-3.5 w-3.5" />
          Use Currently Highlighted Page Text
        </button>
      </div>

      {/* Content Block Selector */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-700">
          01. Choose Selected Content Block to Convert into Audio / Video
        </label>
        <div className="flex flex-wrap gap-1.5 rounded-lg bg-slate-100 p-1.5">
          {selectedItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectItem(item)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeItem?.id === item.id
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {item.title}
            </button>
          ))}
        </div>
      </div>

      {/* Editable Selected Content & Voice Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Selected Content Title
            </label>
            <input
              type="text"
              value={editableTitle}
              onChange={(e) => setEditableTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              placeholder="e.g., First-Aid Care Steps"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Selected Content Text (Editable before generating audio/video)
            </label>
            <textarea
              rows={5}
              value={editableContent}
              onChange={(e) => setEditableContent(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-800 focus:border-slate-900 focus:outline-none"
              placeholder="Select a section from your assessment or paste care instructions here..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Narrator Voice Persona (Gemini TTS)
            </label>
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-slate-900 focus:outline-none"
            >
              {VOICE_OPTIONS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleGenerateAudio}
              disabled={isGeneratingAudio || !editableContent.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {isGeneratingAudio ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
              {isGeneratingAudio ? "Synthesizing Audio..." : "Create Audio Narration (.WAV)"}
            </button>

            <button
              type="button"
              onClick={handleGenerateVideoGuide}
              disabled={isGeneratingVideo || !editableContent.trim()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-900 bg-white px-4 py-2.5 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {isGeneratingVideo ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Film className="h-3.5 w-3.5" />
              )}
              {isGeneratingVideo ? "Building Video Guide..." : "Create Visual Video Guide"}
            </button>
          </div>

          {audioError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {audioError}
            </p>
          )}
          {videoError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {videoError}
            </p>
          )}

          {/* Generated Audio Player Box */}
          {audioDataUrl && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Audio Care Guide Ready ({selectedVoice})
                </span>
                <a
                  href={audioDataUrl}
                  download={`${(editableTitle || "first-aid-audio").toLowerCase().replace(/\s+/g, "-")}.wav`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 underline whitespace-nowrap"
                >
                  <Download className="h-3 w-3" />
                  Download WAV
                </a>
              </div>
              <audio
                ref={audioRef}
                controls
                src={audioDataUrl}
                className="w-full h-9"
              />
            </div>
          )}
        </div>

        {/* Right Column: Interactive Video Storyboard & Canvas Renderer */}
        <div className="lg:col-span-7 space-y-3">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
            <canvas
              ref={canvasRef}
              width={720}
              height={405}
              className="w-full aspect-video block"
            />
          </div>

          {/* Scene scrubber & Video Export Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setIsPlayingCanvas((p) => !p);
                  if (!isPlayingCanvas && audioRef.current) {
                    audioRef.current.currentTime = 0;
                    audioRef.current.play().catch(() => {});
                  }
                }}
                disabled={!storyboard}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {isPlayingCanvas ? (
                  <>
                    <Pause className="h-3.5 w-3.5" /> Pause Walkthrough
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" /> Play Synced Video + Audio
                  </>
                )}
              </button>

              {storyboard?.scenes?.map((sc, idx) => (
                <button
                  key={sc.sceneNumber}
                  type="button"
                  onClick={() => {
                    setIsPlayingCanvas(false);
                    setActiveSceneIndex(idx);
                  }}
                  className={`px-2.5 py-1.5 text-xs font-mono rounded-md transition-colors tabular-nums ${
                    activeSceneIndex === idx
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:text-slate-900"
                  }`}
                >
                  S{sc.sceneNumber}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {storyboard && (
                <button
                  type="button"
                  onClick={handleRecordDownloadableVideo}
                  disabled={isRecordingWebM}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {isRecordingWebM ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Rendering WebM...
                    </>
                  ) : (
                    <>
                      <Film className="h-3.5 w-3.5" /> Render Downloadable Video
                    </>
                  )}
                </button>
              )}

              {videoBlobUrl && (
                <a
                  href={videoBlobUrl}
                  download={`${(editableTitle || "first-aid-guide").toLowerCase().replace(/\s+/g, "-")}.webm`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" /> Download Video (.WebM)
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  let line = "";
  let currY = y;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, currY);
      line = words[n] + " ";
      currY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currY);
}
