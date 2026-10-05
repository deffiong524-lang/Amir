import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  Upload,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Volume2,
  Film,
  Plus,
  Lock,
  EyeOff,
  Clock,
  ArrowRight,
  FileWarning,
  FileDown,
} from "lucide-react";
import {
  ImageViewLabel,
  PatientImageItem,
  PatientIntakeAnswers,
  SelectedContentItem,
  SUPPORTED_CONDITION_CATEGORIES,
  TimelineCase,
  TimelineEntry,
  TriageAssessmentResult,
} from "./types/triage";
import {
  applyPrivacyMaskToImage,
  assetUrlToDataUrl,
  createSimulatedLowQualityPhoto,
  loadEncryptedTimelineCases,
  mergeQualityReports,
  permanentlyPurgeAllHealthData,
  runClientOpticalPreCheck,
  saveEncryptedTimelineCases,
} from "./utils/cryptoAndImage";
import { CameraCaptureModal } from "./components/CameraCaptureModal";
import { MediaCreationStudio } from "./components/MediaCreationStudio";
import { PostDiagnosisChatAndReferral } from "./components/PostDiagnosisChatAndReferral";
import { ExportPdfReportModal } from "./components/ExportPdfReportModal";
import {
  TimelineCalendarAndProgressionSummary,
  TimelineDateFilterState,
  resolveEntryIsoDate,
  formatIsoDateReadable,
} from "./components/TimelineCalendarAndProgressionSummary";

import sampleDay1Url from "./assets/images/sample_forearm_abrasion_day1_1791220145153.jpg";
import sampleDay3Url from "./assets/images/sample_forearm_abrasion_day3_1791220157101.jpg";
import sampleDay7Url from "./assets/images/sample_forearm_abrasion_day7_1791220167971.jpg";
import sampleInsectBiteUrl from "./assets/images/sample_insect_bite_rash_1791220182856.jpg";

type ActiveWorkspaceTab = "triage" | "consultation" | "timeline" | "media-studio" | "privacy";

const VIEW_LABELS: ImageViewLabel[] = [
  "Front view",
  "Side view",
  "Close-up",
  "Comparison with an earlier image",
];

const INITIAL_INTAKE: PatientIntakeAnswers = {
  category: "Cuts and wounds",
  customCondition: "",
  bodyLocation: "Left forearm",
  whatHappened:
    "Scraped my forearm against a rough stone wall while gardening outdoors.",
  whenHappened: "About 3 hours ago today",
  painStatus: "Mild discomfort",
  painLevel: 3,
  bleedingStatus: "Minor / stopped bleeding",
  progressionStatus: "Staying the same",
  additionalNotes: "Rinsed briefly with tap water; no fever or dizziness.",
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>("triage");
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState<boolean>(false);

  useEffect(() => {
    const handleQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener("gmp-quota-exceeded", handleQuota);
    return () => window.removeEventListener("gmp-quota-exceeded", handleQuota);
  }, []);

  // Privacy & Explicit Consent State
  const [hasExplicitConsent, setHasExplicitConsent] = useState<boolean>(true);
  const [consentNonTraining, setConsentNonTraining] = useState<boolean>(true);

  // Patient Images & Camera Modal
  const [images, setImages] = useState<PatientImageItem[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [isExportPdfOpen, setIsExportPdfOpen] = useState<boolean>(false);
  const [uploadViewLabel, setUploadViewLabel] = useState<ImageViewLabel>("Front view");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Patient Structured Intake Answers
  const [intake, setIntake] = useState<PatientIntakeAnswers>(INITIAL_INTAKE);

  // Combined AI Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<TriageAssessmentResult | null>(null);

  // Progress Tracking Timeline State (Day 1 -> Day 3 -> Day 7)
  const [timelineCases, setTimelineCases] = useState<TimelineCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [isComparingTimeline, setIsComparingTimeline] = useState<boolean>(false);
  const [timelineSaveStatus, setTimelineSaveStatus] = useState<string | null>(null);
  const [newEntryDayLabel, setNewEntryDayLabel] = useState<string>("Day 3");
  const [newEntryIsoDate, setNewEntryIsoDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [timelineDateFilter, setTimelineDateFilter] = useState<TimelineDateFilterState>({
    mode: "all",
    selectedDate: "",
    rangeStart: "",
    rangeEnd: "",
  });

  // Audio & Video Selected Content Studio State
  const [selectedContents, setSelectedContents] = useState<SelectedContentItem[]>([
    {
      id: "default-first-aid",
      title: "Basic Wound Cleansing & Protection Guide",
      sourceType: "first-aid-steps",
      content:
        "Step 1: Wash your hands thoroughly with soap and water before touching the affected area. Step 2: Gently rinse the superficial scrape with cool or lukewarm clean running water to remove visible surface debris. Step 3: Pat dry with a clean gauze pad and apply a thin layer of plain petroleum jelly or sterile non-stick dressing. Step 4: Seek medical evaluation if redness spreads, warmth or pus develops, or pain increases.",
      urgencyLevel: "low",
    },
  ]);
  const [activeMediaItem, setActiveMediaItem] = useState<SelectedContentItem | null>(
    selectedContents[0]
  );

  // Load initial sample photo and pre-populated Day 1 -> Day 3 -> Day 7 timeline
  useEffect(() => {
    let mounted = true;
    async function bootstrapInitialData() {
      try {
        const stored = await loadEncryptedTimelineCases();
        if (stored && stored.length > 0 && mounted) {
          setTimelineCases(stored);
          setSelectedCaseId(stored[0].id);
        } else {
          // Seed a realistic Day 1 -> Day 3 -> Day 7 encrypted timeline case from our generated assets
          const [d1, d3, d7] = await Promise.all([
            assetUrlToDataUrl(sampleDay1Url),
            assetUrlToDataUrl(sampleDay3Url),
            assetUrlToDataUrl(sampleDay7Url),
          ]);
          if (!mounted) return;
          const seedCase: TimelineCase = {
            id: "case-forearm-abrasion-1",
            title: "Left Forearm Superficial Abrasion (Day 1 → Day 3 → Day 7)",
            category: "Cuts and wounds",
            createdAt: "2026-09-28",
            encryptedAtRest: true,
            entries: [
              {
                id: "entry-d1",
                dayLabel: "Day 1",
                dateLabel: "Sep 28 · 09:15",
                isoDate: "2026-09-28",
                imageDataUrl: d1,
                viewLabel: "Close-up",
                painLevel: 4,
                progressionStatus: "Just happened / unsure",
                notes: "Initial superficial scrape on stone wall; mild surface oozing stopped after gentle rinse.",
                urgencyLevel: "low",
              },
              {
                id: "entry-d3",
                dayLabel: "Day 3",
                dateLabel: "Sep 30 · 10:00",
                isoDate: "2026-09-30",
                imageDataUrl: d3,
                viewLabel: "Close-up",
                painLevel: 2,
                progressionStatus: "Getting better",
                notes: "Clean dry protective crust formed; surrounding skin redness has not expanded.",
                urgencyLevel: "low",
              },
              {
                id: "entry-d7",
                dayLabel: "Day 7",
                dateLabel: "Oct 04 · 09:40",
                isoDate: "2026-10-04",
                imageDataUrl: d7,
                viewLabel: "Close-up",
                painLevel: 0,
                progressionStatus: "Getting better",
                notes: "Surface nearly re-epithelialized with smooth pink skin and no tenderness.",
                urgencyLevel: "low",
              },
            ],
          };
          setTimelineCases([seedCase]);
          setSelectedCaseId(seedCase.id);
          await saveEncryptedTimelineCases([seedCase]);

          // Also load Day 1 photo into the active Triage workspace so the user can test immediately
          await addImageWithQualityCheck(d1, "Close-up", "Day 1", "Cuts and wounds");
        }
      } catch (err) {
        console.warn("Bootstrap sample load notice:", err);
      }
    }
    bootstrapInitialData();
    return () => {
      mounted = false;
    };
  }, []);

  // Automatically sync assessment sections into the Selected Contents Audio & Video Studio
  useEffect(() => {
    if (!assessment) return;
    const newItems: SelectedContentItem[] = [
      {
        id: "assess-observation",
        title: `Visual Observation & Urgency (${assessment.urgencyTitle})`,
        sourceType: "observation",
        content: `${assessment.urgencyTitle}. ${assessment.cautiousObservationSummary} ${assessment.urgencyRationale} Note on limitations: ${assessment.visualLimitationsNote}`,
        urgencyLevel: assessment.urgencyLevel,
      },
      {
        id: "assess-steps",
        title: `Recommended First-Aid Steps (${assessment.firstAidSteps.length} Steps)`,
        sourceType: "first-aid-steps",
        content: assessment.firstAidSteps
          .map(
            (s) =>
              `Step ${s.stepNumber}: ${s.title}. ${s.instruction} Caution: ${s.cautionNote}`
          )
          .join(" "),
        urgencyLevel: assessment.urgencyLevel,
      },
      {
        id: "assess-warnings",
        title: "Warning Signs Requiring Medical Escalation",
        sourceType: "warning-signs",
        content: `Watch closely for these warning signs that require prompt evaluation by a healthcare professional: ${assessment.warningSignsForEscalation.join(
          "; "
        )}.`,
        urgencyLevel: assessment.urgencyLevel,
      },
    ];
    setSelectedContents(newItems);
    setActiveMediaItem(newItems[1] || newItems[0]);
  }, [assessment]);

  const addImageWithQualityCheck = async (
    dataUrl: string,
    viewLabel: ImageViewLabel,
    dayLabel?: string,
    categoryOverride?: string
  ) => {
    const newId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newItem: PatientImageItem = {
      id: newId,
      dataUrl,
      viewLabel,
      dayLabel,
      capturedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isCheckingQuality: true,
    };

    setImages((prev) => [...prev, newItem]);

    try {
      const optical = await runClientOpticalPreCheck(dataUrl);
      const res = await fetch("/api/analyze-quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: dataUrl,
          expectedConditionCategory: categoryOverride || intake.category,
          viewLabel,
        }),
      });

      if (res.ok) {
        const aiQuality = await res.json();
        const merged = mergeQualityReports(optical, aiQuality);
        setImages((prev) =>
          prev.map((img) =>
            img.id === newId
              ? { ...img, qualityReport: merged, isCheckingQuality: false }
              : img
          )
        );
      } else {
        // Fallback to client optical report if server call fails
        setImages((prev) =>
          prev.map((img) =>
            img.id === newId
              ? {
                  ...img,
                  isCheckingQuality: false,
                  qualityReport: {
                    overallPass: optical.localIssues.length === 0,
                    qualityScore: optical.localIssues.length === 0 ? 88 : 35,
                    isTooDark: optical.meanLuminance < 38,
                    isBlurry: optical.edgeVariance < 32,
                    isTooFarAway: false,
                    isObstructed: false,
                    isWrongBodyArea: false,
                    isTooLowResolution: optical.width < 220,
                    hasIdentifyingInfoWarning: false,
                    detectedIssues: optical.localIssues,
                    lightingSummary: `Resolution ${optical.width}×${optical.height}px · Mean luminance ${optical.meanLuminance}/255`,
                    retakeGuidance:
                      optical.localIssues.length > 0
                        ? "This image is too dark or blurry to assess reliably. Please take another photo in bright, even lighting."
                        : "Photo clarity and lighting passed pre-check.",
                    width: optical.width,
                    height: optical.height,
                    meanLuminance: optical.meanLuminance,
                  },
                }
              : img
          )
        );
      }
    } catch {
      setImages((prev) =>
        prev.map((img) => (img.id === newId ? { ...img, isCheckingQuality: false } : img))
      );
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          addImageWithQualityCheck(reader.result, uploadViewLabel);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleApplyPrivacyMask = async (id: string) => {
    const target = images.find((i) => i.id === id);
    if (!target) return;
    const maskedUrl = await applyPrivacyMaskToImage(target.dataUrl);
    setImages((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, dataUrl: maskedUrl, privacyRedacted: true } : i
      )
    );
  };

  const handleDeleteImage = (id: string) => {
    setImages((prev) => prev.filter((i) => i.id !== id));
  };

  const handleLoadClinicalSample = async (
    preset: "abrasion-multi" | "insect-sting" | "low-quality-gate" | "emergency-case"
  ) => {
    setAssessment(null);
    setAnalysisError(null);
    setImages([]);

    if (preset === "abrasion-multi") {
      setIntake({
        category: "Cuts and wounds",
        bodyLocation: "Left forearm",
        whatHappened: "Scraped forearm on rough masonry while carrying garden pots.",
        whenHappened: "Day 1 vs Day 3 comparison",
        painStatus: "Mild discomfort",
        painLevel: 2,
        bleedingStatus: "Minor / stopped bleeding",
        progressionStatus: "Getting better",
        additionalNotes: "Uploading both Day 1 initial photo and Day 3 follow-up photo to compare visible healing.",
      });
      const [d1, d3] = await Promise.all([
        assetUrlToDataUrl(sampleDay1Url),
        assetUrlToDataUrl(sampleDay3Url),
      ]);
      await addImageWithQualityCheck(d1, "Front view", "Day 1", "Cuts and wounds");
      await addImageWithQualityCheck(
        d3,
        "Comparison with an earlier image",
        "Day 3",
        "Cuts and wounds"
      );
    } else if (preset === "insect-sting") {
      setIntake({
        category: "Insect bites and stings",
        bodyLocation: "Lower leg",
        whatHappened: "Stung or bitten by an insect while walking through tall grass.",
        whenHappened: "About 6 hours ago",
        painStatus: "Moderate pain",
        painLevel: 5,
        bleedingStatus: "No bleeding",
        progressionStatus: "Getting worse",
        additionalNotes: "Area feels warm, itchy, and mildly swollen around the central red spot. No shortness of breath.",
      });
      const stingUrl = await assetUrlToDataUrl(sampleInsectBiteUrl);
      await addImageWithQualityCheck(
        stingUrl,
        "Close-up",
        "Day 1",
        "Insect bites and stings"
      );
    } else if (preset === "low-quality-gate") {
      const blurryDarkUrl = createSimulatedLowQualityPhoto();
      await addImageWithQualityCheck(blurryDarkUrl, "Front view", undefined, "Rashes");
    } else if (preset === "emergency-case") {
      setIntake({
        category: "Bleeding",
        bodyLocation: "Right forearm / wrist",
        whatHappened: "Deep laceration from broken glass with persistent heavy bleeding and numbness in fingers.",
        whenHappened: "10 minutes ago",
        painStatus: "Severe pain",
        painLevel: 9,
        bleedingStatus: "Significant or uncontrolled bleeding",
        progressionStatus: "Getting worse",
        additionalNotes: "Bleeding has soaked through two cloths and hand feels cold/tingling.",
      });
      const d1 = await assetUrlToDataUrl(sampleDay1Url);
      await addImageWithQualityCheck(d1, "Close-up", "Acute", "Bleeding");
    }
  };

  const hasUnreliableQualityImage = images.some(
    (img) => img.qualityReport && !img.qualityReport.overallPass
  );

  const handleRunCombinedAnalysis = async () => {
    if (!hasExplicitConsent) {
      setAnalysisError("Please confirm explicit consent before processing patient images.");
      return;
    }
    if (images.length === 0) {
      setAnalysisError("Please upload or capture at least one photo of the affected area.");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await fetch("/api/analyze-condition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: images.map((img) => ({
            dataUrl: img.dataUrl,
            viewLabel: img.viewLabel,
            dayLabel: img.dayLabel,
          })),
          intake,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to complete AI patient image analysis.");
      }
      setAssessment(data);
    } catch (err: any) {
      setAnalysisError(err?.message || "Error running combined analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveCurrentToTimeline = async () => {
    if (images.length === 0) return;
    const primaryImg = images[0];
    const chosenIso = newEntryIsoDate || new Date().toISOString().slice(0, 10);
    const [y, m, d] = chosenIso.split("-").map(Number);
    const chosenDateObj = y && m && d ? new Date(y, m - 1, d) : new Date();
    const formattedDatePart = chosenDateObj.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
    });
    const timePart = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const newEntry: TimelineEntry = {
      id: `entry-${Date.now()}`,
      dayLabel: newEntryDayLabel || `Day ${timelineCases[0]?.entries.length + 1 || 1}`,
      dateLabel: `${formattedDatePart} · ${timePart}`,
      isoDate: chosenIso,
      imageDataUrl: primaryImg.dataUrl,
      viewLabel: primaryImg.viewLabel,
      painLevel: intake.painLevel,
      progressionStatus: intake.progressionStatus,
      notes: `${intake.whatHappened} (${intake.painStatus}, ${intake.bleedingStatus})`,
      assessmentSummary: assessment?.cautiousObservationSummary,
      urgencyLevel: assessment?.urgencyLevel,
    };

    let updatedCases: TimelineCase[];
    if (selectedCaseId && timelineCases.some((c) => c.id === selectedCaseId)) {
      updatedCases = timelineCases.map((c) =>
        c.id === selectedCaseId ? { ...c, entries: [...c.entries, newEntry] } : c
      );
    } else {
      const freshCase: TimelineCase = {
        id: `case-${Date.now()}`,
        title: `${intake.bodyLocation || "Patient"} — ${intake.category}`,
        category: intake.category,
        createdAt: new Date().toISOString().slice(0, 10),
        encryptedAtRest: true,
        entries: [newEntry],
      };
      updatedCases = [freshCase, ...timelineCases];
      setSelectedCaseId(freshCase.id);
    }

    setTimelineCases(updatedCases);
    await saveEncryptedTimelineCases(updatedCases);
    setTimelineSaveStatus(`Encrypted & saved as ${newEntry.dayLabel} in Progress Timeline.`);
    setTimeout(() => setTimelineSaveStatus(null), 4000);
  };

  const handleCompareTimelineProgression = async (caseItem: TimelineCase) => {
    if (caseItem.entries.length < 2) return;
    setIsComparingTimeline(true);
    try {
      const res = await fetch("/api/compare-timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseTitle: caseItem.title,
          entries: caseItem.entries,
        }),
      });
      const report = await res.json();
      if (!res.ok) throw new Error(report.error || "Comparison failed");

      const updated = timelineCases.map((c) =>
        c.id === caseItem.id ? { ...c, comparisonReport: report } : c
      );
      setTimelineCases(updated);
      await saveEncryptedTimelineCases(updated);

      // Add timeline comparison to Selected Content Studio so user can create audio/video about it!
      const mediaItem: SelectedContentItem = {
        id: `timeline-comp-${Date.now()}`,
        title: `Timeline Progression (${caseItem.entries.map((e) => e.dayLabel).join(" → ")})`,
        sourceType: "timeline-comparison",
        content: `${report.timelineProgressionHeadline}. ${report.visibleChangesSummary} ${report.dayByDayTransitions
          .map((t: any) => `${t.intervalLabel}: ${t.observedVisualShift}`)
          .join(" ")} Caveat: ${report.lightingAndAngleCaveat}`,
        urgencyLevel: "low",
      };
      setSelectedContents((prev) => [mediaItem, ...prev]);
      setActiveMediaItem(mediaItem);
    } catch (err) {
      console.error(err);
    } finally {
      setIsComparingTimeline(false);
    }
  };

  const handleDeleteTimelineEntry = async (caseId: string, entryId: string) => {
    const updated = timelineCases
      .map((c) =>
        c.id === caseId
          ? { ...c, entries: c.entries.filter((e) => e.id !== entryId) }
          : c
      )
      .filter((c) => c.entries.length > 0);
    setTimelineCases(updated);
    await saveEncryptedTimelineCases(updated);
  };

  const handleUpdateTimelineEntryDate = async (
    caseId: string,
    entryId: string,
    nextIsoDate: string
  ) => {
    if (!nextIsoDate) return;
    const [y, m, d] = nextIsoDate.split("-").map(Number);
    const dateObj = y && m && d ? new Date(y, m - 1, d) : new Date();
    const shortMonthDay = dateObj.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
    });

    const updated = timelineCases.map((c) => {
      if (c.id !== caseId) return c;
      return {
        ...c,
        entries: c.entries.map((entry) => {
          if (entry.id !== entryId) return entry;
          const timeSuffix = entry.dateLabel.includes("·")
            ? entry.dateLabel.split("·")[1].trim()
            : "09:00";
          return {
            ...entry,
            isoDate: nextIsoDate,
            dateLabel: `${shortMonthDay} · ${timeSuffix}`,
          };
        }),
      };
    });
    setTimelineCases(updated);
    await saveEncryptedTimelineCases(updated);
  };

  const handleSendToMediaStudio = (
    title: string,
    content: string,
    sourceType: SelectedContentItem["sourceType"] = "custom-selection"
  ) => {
    const item: SelectedContentItem = {
      id: `sel-${Date.now()}`,
      title,
      sourceType,
      content,
      urgencyLevel: assessment?.urgencyLevel || "low",
    };
    setSelectedContents((prev) => [item, ...prev.filter((i) => i.title !== title)]);
    setActiveMediaItem(item);
    setActiveTab("media-studio");
  };

  const activeTimelineCase =
    timelineCases.find((c) => c.id === selectedCaseId) || timelineCases[0];

  const filteredTimelineEntries = React.useMemo(() => {
    if (!activeTimelineCase) return [];
    return activeTimelineCase.entries.filter((entry, idx) => {
      const resolvedIso = resolveEntryIsoDate(
        entry,
        activeTimelineCase.createdAt,
        idx
      );
      if (timelineDateFilter.mode === "single" && timelineDateFilter.selectedDate) {
        return resolvedIso === timelineDateFilter.selectedDate;
      }
      if (timelineDateFilter.mode === "range") {
        const afterStart =
          !timelineDateFilter.rangeStart ||
          resolvedIso >= timelineDateFilter.rangeStart;
        const beforeEnd =
          !timelineDateFilter.rangeEnd ||
          resolvedIso <= timelineDateFilter.rangeEnd;
        return afterStart && beforeEnd;
      }
      return true;
    });
  }, [activeTimelineCase, timelineDateFilter]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{" "}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{" "}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab("triage");
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap"
        >
          Clarion Triage
        </a>

        {/* Zone 2: 5 clean text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setActiveTab("triage")}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeTab === "triage"
                ? "text-slate-900 border-b-2 border-slate-900 font-semibold"
                : "hover:text-slate-900"
            }`}
          >
            Image Assessment
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("consultation")}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeTab === "consultation"
                ? "text-slate-900 border-b-2 border-slate-900 font-semibold"
                : "hover:text-slate-900"
            }`}
          >
            AI Chat &amp; Hospital Referral
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("timeline")}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeTab === "timeline"
                ? "text-slate-900 border-b-2 border-slate-900 font-semibold"
                : "hover:text-slate-900"
            }`}
          >
            Progress Timeline ({timelineCases.reduce((acc, c) => acc + c.entries.length, 0)})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("media-studio")}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeTab === "media-studio"
                ? "text-slate-900 border-b-2 border-slate-900 font-semibold"
                : "hover:text-slate-900"
            }`}
          >
            Audio &amp; Video Guides
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("privacy")}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeTab === "privacy"
                ? "text-slate-900 border-b-2 border-slate-900 font-semibold"
                : "hover:text-slate-900"
            }`}
          >
            Privacy &amp; Security
          </button>
        </nav>

        {/* Zone 3: Primary actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsExportPdfOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <FileDown className="h-3.5 w-3.5 text-slate-700" />
            Export Local PDF Report
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("triage");
              setIsCameraOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Camera className="h-3.5 w-3.5" />
            Take Photo
          </button>
        </div>
      </header>

      {/* Mobile Tab Selector */}
      <div className="flex md:hidden border-b border-slate-200 bg-white px-4 py-2 gap-2 overflow-x-auto">
        {(
          [
            ["triage", "Image Assessment"],
            ["consultation", "AI Chat & Hospitals"],
            ["timeline", "Progress Timeline"],
            ["media-studio", "Audio & Video Guides"],
            ["privacy", "Privacy & Security"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
              activeTab === key ? "bg-slate-900 text-white" : "text-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Mandatory Clinical Image Disclaimer Bar */}
      <div className="border-b border-slate-200 bg-slate-900 text-slate-100 px-6 py-3">
        <div className="mx-auto max-w-[1360px] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs leading-relaxed">
          <p className="text-slate-200">
            <strong className="font-semibold text-white">Medical Image Disclaimer: </strong>
            “This AI can identify some visible features and provide first-aid guidance, but it cannot reliably diagnose medical conditions from a photograph. If you are seriously concerned about your condition, seek evaluation from a qualified healthcare professional.”
          </p>
          <span className="text-slate-400 whitespace-nowrap font-mono text-[11px]">
            3-Source Architecture: Description · Q&amp;A · Image
          </span>
        </div>
      </div>

      {/* Main Content Container (1440px Desktop Presence) */}
      <main className="mx-auto w-full max-w-[1360px] flex-1 px-6 py-8 space-y-8">
        {/* TAB 1: AI PATIENT IMAGE ANALYSIS WORKBENCH */}
        {activeTab === "triage" && (
          <>
            {/* Quick Clinical Scenario Presets Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 text-balance">
                  AI Patient Image &amp; First-Aid Assessment
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Combines your visible symptom photo(s), injury description, and structured clinical questions for cautious first-aid guidance.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-500 mr-1">
                  Try Clinical Test Case:
                </span>
                <button
                  type="button"
                  onClick={() => handleLoadClinicalSample("abrasion-multi")}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  Day 1 vs Day 3 Scrape
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadClinicalSample("insect-sting")}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  Insect Bite Swelling
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadClinicalSample("low-quality-gate")}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  Dark/Blurry Quality Gate
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadClinicalSample("emergency-case")}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 transition-colors whitespace-nowrap"
                >
                  Emergency Alert Case
                </button>
              </div>
            </div>

            {/* Two-Column Workbench: Left = Image Upload & Intake Q&A | Right = AI Assessment Output */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* LEFT COLUMN (7 cols): Step 1 (Photos + Quality Check) & Step 2 (5 Patient Questions) */}
              <div className="lg:col-span-7 space-y-8">
                {/* STEP 01: Upload or Take a Clear Photo */}
                <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <span className="text-xs font-mono text-slate-500">
                        01. PATIENT IMAGE CAPTURE &amp; QUALITY VERIFICATION
                      </span>
                      <h2 className="text-lg font-semibold text-slate-900 mt-0.5">
                        “Upload or take a clear photo of the affected area.”
                      </h2>
                    </div>

                    {/* Angle Tag for next upload */}
                    <div className="flex items-center gap-1.5">
                      <label htmlFor="angle-select" className="text-xs text-slate-500">
                        View tag:
                      </label>
                      <select
                        id="angle-select"
                        value={uploadViewLabel}
                        onChange={(e) => setUploadViewLabel(e.target.value as ImageViewLabel)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-slate-900 focus:outline-none"
                      >
                        {VIEW_LABELS.map((label) => (
                          <option key={label} value={label}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Automatic Privacy Warning Banner */}
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="font-semibold">
                        Privacy Protection Notice — Avoid Unnecessary Identifying Details
                      </p>
                      <p className="text-amber-800">
                        Please frame only the affected skin or injury area. Do not include your face, driver&apos;s license, hospital wristband, or distinctive background documents.
                      </p>
                    </div>
                  </div>

                  {/* Upload / Camera Dropzone */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setIsCameraOpen(true)}
                      className="flex items-center justify-center gap-2.5 rounded-lg border border-slate-900 bg-slate-900 px-4 py-3.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
                    >
                      <Camera className="h-4 w-4" />
                      Take Photo with Camera
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-3.5 text-xs font-semibold text-slate-900 hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                      <Upload className="h-4 w-4" />
                      Upload Existing Image(s)
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>

                  {/* Uploaded Images List + Pre-flight Quality Check Diagnostics */}
                  {images.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                      <p className="text-sm font-medium text-slate-700">
                        No patient photos uploaded yet
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Upload multiple angles (Front view, Side view, Close-up, or Comparison with an earlier image) to begin.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                          Uploaded Photos ({images.length}) · Supports multiple angles &amp; chronological comparisons
                        </span>
                        <button
                          type="button"
                          onClick={() => setImages([])}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          Remove All Photos
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {images.map((img, index) => {
                          const qr = img.qualityReport;
                          return (
                            <div
                              key={img.id}
                              className="rounded-lg border border-slate-200 bg-slate-50/60 overflow-hidden flex flex-col justify-between"
                            >
                              <div>
                                <div className="relative aspect-4/3 w-full bg-slate-900 overflow-hidden">
                                  <img
                                    src={img.dataUrl}
                                    alt={`Patient submission ${index + 1} - ${img.viewLabel}`}
                                    referrerPolicy="no-referrer"
                                    className="h-full w-full object-cover"
                                  />
                                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                                    <select
                                      value={img.viewLabel}
                                      onChange={(e) => {
                                        const nextView = e.target.value as ImageViewLabel;
                                        setImages((prev) =>
                                          prev.map((item) =>
                                            item.id === img.id
                                              ? { ...item, viewLabel: nextView }
                                              : item
                                          )
                                        );
                                      }}
                                      aria-label="Photo angle view"
                                      className="rounded-md bg-slate-950/80 text-white px-2.5 py-1 text-xs font-medium backdrop-blur-xs border border-white/15"
                                    >
                                      {VIEW_LABELS.map((v) => (
                                        <option key={v} value={v}>
                                          {v}
                                        </option>
                                      ))}
                                    </select>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteImage(img.id)}
                                      className="rounded-md bg-slate-950/80 p-1.5 text-white hover:bg-red-600 transition-colors"
                                      title="Delete image permanently"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Quality Check Status Block */}
                                <div className="p-3.5 space-y-2">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-mono text-slate-500 tabular-nums">
                                      Photo #{index + 1}
                                      {img.dayLabel ? ` · ${img.dayLabel}` : ""} · {img.capturedAt}
                                    </span>
                                    {img.isCheckingQuality ? (
                                      <span className="text-slate-600 flex items-center gap-1 font-medium">
                                        <RefreshCw className="h-3 w-3 animate-spin" /> Checking Quality...
                                      </span>
                                    ) : qr?.overallPass ? (
                                      <span className="text-emerald-700 font-semibold flex items-center gap-1 tabular-nums">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Quality Passed ({qr.qualityScore}/100)
                                      </span>
                                    ) : (
                                      <span className="text-red-700 font-semibold flex items-center gap-1 tabular-nums">
                                        <AlertTriangle className="h-3.5 w-3.5" /> Retake Recommended
                                      </span>
                                    )}
                                  </div>

                                  {qr && (
                                    <>
                                      <p className="text-xs text-slate-600 leading-relaxed">
                                        {qr.overallPass ? qr.lightingSummary : qr.retakeGuidance}
                                      </p>

                                      {/* 6 Quality Check Dimensions Breakdown */}
                                      {!qr.overallPass && (
                                        <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-900 space-y-1">
                                          <p className="font-semibold">
                                            Unreliable Image Quality Detected — Please Retake Photo:
                                          </p>
                                          <p className="text-red-800">
                                            Issues:{" "}
                                            {[
                                              qr.isTooDark && "Too dark",
                                              qr.isBlurry && "Blurry",
                                              qr.isTooFarAway && "Too far away",
                                              qr.isObstructed && "Obstructed",
                                              qr.isWrongBodyArea && "Wrong body area",
                                              qr.isTooLowResolution && "Too low resolution",
                                              ...(qr.detectedIssues || []),
                                            ]
                                              .filter(Boolean)
                                              .join(" · ") || "Suboptimal clarity"}
                                          </p>
                                        </div>
                                      )}

                                      {qr.hasIdentifyingInfoWarning && (
                                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                                          Possible identifying feature detected. Consider cropping or applying the Privacy Mask below.
                                        </p>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="border-t border-slate-200 px-3.5 py-2 bg-white flex items-center justify-between">
                                <button
                                  type="button"
                                  onClick={() => handleApplyPrivacyMask(img.id)}
                                  disabled={img.privacyRedacted}
                                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                                >
                                  <EyeOff className="h-3.5 w-3.5" />
                                  {img.privacyRedacted
                                    ? "Privacy Mask Applied"
                                    : "Apply Privacy Mask"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteImage(img.id)}
                                  className="text-xs text-slate-500 hover:text-red-600"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>

                {/* STEP 02: Patient Questions & Symptom Context */}
                <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
                  <div className="border-b border-slate-100 pb-4">
                    <span className="text-xs font-mono text-slate-500">
                      02. STRUCTURED CLINICAL INTAKE QUESTIONS
                    </span>
                    <h2 className="text-lg font-semibold text-slate-900 mt-0.5">
                      Describe Your Condition &amp; Symptoms
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      The AI combines your answers below with the visible features in your photo(s).
                    </p>
                  </div>

                  {/* Supported Condition Category (V.C.C.) & Body Location */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-slate-700">
                        Visible Condition Category (V.C.C. — 16 Supported Assessments)
                      </label>
                      <select
                        value={
                          SUPPORTED_CONDITION_CATEGORIES.includes(intake.category as any)
                            ? intake.category
                            : "__CUSTOM_VCC__"
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "__CUSTOM_VCC__") {
                            setIntake((prev) => ({
                              ...prev,
                              category: prev.customCondition?.trim() || "Custom patient condition",
                            }));
                          } else {
                            setIntake((prev) => ({
                              ...prev,
                              category: val,
                              customCondition: "",
                            }));
                          }
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-slate-900 focus:outline-none"
                      >
                        {SUPPORTED_CONDITION_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                        <option value="__CUSTOM_VCC__">
                          Not in the 16 V.C.C. list — Enter custom condition below
                        </option>
                      </select>

                      {/* Custom Condition Input if not found on the 16 list of V.C.C. */}
                      <div className="pt-0.5">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Condition not found on the 16 V.C.C. list? Input your condition:
                        </label>
                        <input
                          type="text"
                          value={intake.customCondition || ""}
                          onChange={(e) => {
                            const customVal = e.target.value;
                            setIntake((prev) => ({
                              ...prev,
                              customCondition: customVal,
                              category: customVal.trim() ? customVal : "Other externally visible injuries",
                            }));
                          }}
                          placeholder="Type your specific condition (e.g., blister, hives, sunburn, joint swelling)..."
                          className="w-full rounded-lg border border-slate-300 bg-slate-50/70 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Affected Body Area
                      </label>
                      <input
                        type="text"
                        value={intake.bodyLocation}
                        onChange={(e) =>
                          setIntake((prev) => ({ ...prev, bodyLocation: e.target.value }))
                        }
                        placeholder="e.g., Left forearm, right ankle, index finger"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Question 1: What happened? */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                      1. What happened?
                    </label>
                    <textarea
                      rows={2}
                      value={intake.whatHappened}
                      onChange={(e) =>
                        setIntake((prev) => ({ ...prev, whatHappened: e.target.value }))
                      }
                      placeholder="Describe how the injury, rash, burn, or symptom started..."
                      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  {/* Question 2: When did it happen? */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                      2. When did it happen?
                    </label>
                    <input
                      type="text"
                      value={intake.whenHappened}
                      onChange={(e) =>
                        setIntake((prev) => ({ ...prev, whenHappened: e.target.value }))
                      }
                      placeholder="e.g., 2 hours ago, yesterday evening, noticed 3 days ago"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  {/* Question 3: Is the area painful? */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-800">
                        3. Is the area painful?
                      </label>
                      <span className="text-xs font-mono text-slate-600 tabular-nums">
                        Pain Intensity: {intake.painLevel}/10 ({intake.painStatus})
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(
                        [
                          ["No pain", 0],
                          ["Mild discomfort", 3],
                          ["Moderate pain", 6],
                          ["Severe pain", 9],
                        ] as const
                      ).map(([label, defaultScore]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() =>
                            setIntake((prev) => ({
                              ...prev,
                              painStatus: label,
                              painLevel: defaultScore,
                            }))
                          }
                          className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                            intake.painStatus === label
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Question 4: Is there bleeding? */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-800">
                      4. Is there bleeding?
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(
                        [
                          "No bleeding",
                          "Minor / stopped bleeding",
                          "Slow oozing / controlled",
                          "Significant or uncontrolled bleeding",
                        ] as const
                      ).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() =>
                            setIntake((prev) => ({ ...prev, bleedingStatus: status }))
                          }
                          className={`px-3 py-2 text-xs font-medium rounded-lg border text-left transition-colors ${
                            intake.bleedingStatus === status
                              ? status.includes("uncontrolled")
                                ? "border-red-700 bg-red-700 text-white"
                                : "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Question 5: Is the condition getting better or worse? */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-800">
                      5. Is the condition getting better or worse?
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(
                        [
                          "Getting better",
                          "Staying the same",
                          "Getting worse",
                          "Just happened / unsure",
                        ] as const
                      ).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() =>
                            setIntake((prev) => ({ ...prev, progressionStatus: status }))
                          }
                          className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                            intake.progressionStatus === status
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Explicit Consent Gate & Submit Button */}
                  <div className="border-t border-slate-200 pt-4 space-y-4">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasExplicitConsent}
                        onChange={(e) => setHasExplicitConsent(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      />
                      <span className="text-xs text-slate-600 leading-relaxed">
                        <strong className="text-slate-900">Explicit Patient Consent:</strong> I consent to processing my uploaded image(s) and symptom answers to generate cautious first-aid guidance. I understand this is not a confirmed medical diagnosis, my images are never used for AI model training without explicit opt-in, and I can permanently delete my photos at any time.
                      </span>
                    </label>

                    {hasUnreliableQualityImage && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 flex items-start gap-2.5">
                        <FileWarning className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">
                            One or more uploaded photos failed the Image Quality Check
                          </p>
                          <p className="mt-0.5 text-amber-900">
                            Because blurry, dark, or obstructed photos cannot be assessed reliably, please take another clear photo in good lighting rather than relying on a guess.
                          </p>
                        </div>
                      </div>
                    )}

                    {analysisError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                        {analysisError}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleRunCombinedAnalysis}
                      disabled={isAnalyzing || !hasExplicitConsent || images.length === 0}
                      className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    >
                      {isAnalyzing ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Analyzing Patient Image(s) + Description + Intake Answers...
                        </>
                      ) : (
                        <>
                          Analyze Condition &amp; Generate First-Aid Assessment
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </div>
                </section>
              </div>

              {/* RIGHT COLUMN (5 cols): AI First-Aid Assessment, Risk Tier, Emergency Detection & Audio/Video Triggers */}
              <div className="lg:col-span-5 space-y-6">
                {!assessment && !isAnalyzing && (
                  <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                    <span className="text-xs font-mono text-slate-500">
                      03. TRIAGE ASSESSMENT &amp; FIRST-AID OUTPUT
                    </span>
                    <h3 className="text-base font-semibold text-slate-900">
                      Ready to Combine All 3 Clinical Sources
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Click <strong>“Analyze Condition &amp; Generate First-Aid Assessment”</strong> to evaluate your uploaded photo(s) alongside your description and symptom answers.
                    </p>
                    <div className="border-t border-slate-100 pt-4 space-y-2 text-xs text-slate-500">
                      <p className="font-medium text-slate-700">Risk &amp; Urgency Tiers:</p>
                      <p>🟢 Low concern / basic first aid</p>
                      <p>🟡 Needs medical evaluation</p>
                      <p>🔴 Potential emergency — seek immediate medical care</p>
                    </div>
                  </div>
                )}

                {isAnalyzing && (
                  <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 animate-pulse">
                    <div className="h-4 w-40 rounded bg-slate-200" />
                    <div className="h-16 w-full rounded-lg bg-slate-100" />
                    <div className="space-y-2">
                      <div className="h-4 w-3/4 rounded bg-slate-200" />
                      <div className="h-4 w-full rounded bg-slate-100" />
                      <div className="h-4 w-5/6 rounded bg-slate-100" />
                    </div>
                  </div>
                )}

                {assessment && (
                  <div className="space-y-6">
                    {/* EMERGENCY IMAGE DETECTION BANNER */}
                    {(assessment.isEmergency || assessment.urgencyLevel === "high") && (
                      <div
                        role="alert"
                        className="rounded-xl border-2 border-red-600 bg-red-950 text-white p-6 space-y-3 shadow-md"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold tracking-wide text-red-200">
                            🚨 POSSIBLE MEDICAL EMERGENCY
                          </span>
                          <span className="font-mono text-xs text-red-300">
                            IMMEDIATE ESCALATION
                          </span>
                        </div>
                        <p className="text-sm font-medium leading-relaxed text-white">
                          “Based on what is visible and what you&apos;ve described, this may require urgent medical attention. Please contact your local emergency service or go to the nearest emergency department.”
                        </p>
                        {assessment.emergencyBannerMessage && (
                          <p className="text-xs text-red-200 border-t border-red-800/80 pt-2.5 leading-relaxed">
                            {assessment.emergencyBannerMessage}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Retake Prompt if AI determines image is unreliable */}
                    {assessment.unreliableImageQuality && (
                      <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-2">
                        <h3 className="text-sm font-bold text-amber-950">
                          Unable to Assess Photo Reliably — Please Retake Photo
                        </h3>
                        <p className="text-xs text-amber-900 leading-relaxed">
                          Rather than guessing from an unclear, dark, or obstructed image, please take a new photo in even lighting focused 15–25 cm from the affected area.
                        </p>
                      </div>
                    )}

                    {/* Main Assessment Card */}
                    <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
                      {/* Risk / Urgency Tier Header */}
                      <div
                        className={`rounded-lg border p-4 ${
                          assessment.urgencyLevel === "high"
                            ? "border-red-300 bg-red-50 text-red-950"
                            : assessment.urgencyLevel === "medium"
                            ? "border-amber-300 bg-amber-50 text-amber-950"
                            : "border-emerald-300 bg-emerald-50 text-emerald-950"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono font-semibold">
                            {assessment.urgencyLevel === "high"
                              ? "🔴 POTENTIAL EMERGENCY — SEEK IMMEDIATE MEDICAL CARE"
                              : assessment.urgencyLevel === "medium"
                              ? "🟡 NEEDS MEDICAL EVALUATION"
                              : "🟢 LOW CONCERN / BASIC FIRST AID"}
                          </span>
                        </div>
                        <h3 className="text-base font-bold mt-1">{assessment.urgencyTitle}</h3>
                        <p className="text-xs mt-1 leading-relaxed opacity-90">
                          {assessment.urgencyRationale}
                        </p>
                      </div>

                      {/* Cautious Observational Summary + Audio/Video Action */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-semibold text-slate-900">
                            Cautious Visual &amp; Symptom Observation
                          </h4>
                          <button
                            type="button"
                            onClick={() =>
                              handleSendToMediaStudio(
                                `Visual Assessment: ${intake.category}`,
                                `${assessment.cautiousObservationSummary} ${assessment.urgencyRationale}`,
                                "observation"
                              )
                            }
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 underline whitespace-nowrap"
                          >
                            <Volume2 className="h-3.5 w-3.5" /> Create Audio / Video for This
                          </button>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-3.5 border border-slate-200/80">
                          {assessment.cautiousObservationSummary}
                        </p>
                      </div>

                      {/* Visible Characteristics Observed */}
                      {assessment.visibleCharacteristics?.length > 0 && (
                        <div className="space-y-2.5 border-t border-slate-100 pt-4">
                          <h4 className="text-xs font-semibold text-slate-900">
                            Observed Visible Characteristics
                          </h4>
                          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                            {assessment.visibleCharacteristics.map((vc, i) => (
                              <div key={i} className="p-3 text-xs space-y-0.5">
                                <div className="flex items-center justify-between font-medium text-slate-900">
                                  <span>{vc.feature}</span>
                                  <span className="text-[11px] font-mono text-slate-500">
                                    {vc.imageReference}
                                  </span>
                                </div>
                                <p className="text-slate-600 leading-relaxed">{vc.observation}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Multi-Image Comparison Note */}
                      {images.length > 1 && assessment.multiImageComparison && (
                        <div className="space-y-1.5 border-t border-slate-100 pt-4">
                          <h4 className="text-xs font-semibold text-slate-900">
                            Multi-Image / Multi-Angle Comparison
                          </h4>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {assessment.multiImageComparison}
                          </p>
                        </div>
                      )}

                      {/* Step-by-Step First-Aid Instructions */}
                      <div className="space-y-3 border-t border-slate-100 pt-4">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-semibold text-slate-900">
                            Recommended First-Aid Steps
                          </h4>
                          <button
                            type="button"
                            onClick={() =>
                              handleSendToMediaStudio(
                                `First-Aid Care Guide: ${intake.category}`,
                                assessment.firstAidSteps
                                  .map(
                                    (s) =>
                                      `Step ${s.stepNumber}: ${s.title}. ${s.instruction} Caution: ${s.cautionNote}`
                                  )
                                  .join(" "),
                                "first-aid-steps"
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
                          >
                            <Film className="h-3 w-3" /> Generate Video &amp; Audio Walkthrough
                          </button>
                        </div>

                        <div className="space-y-2.5">
                          {assessment.firstAidSteps.map((step) => (
                            <div
                              key={step.stepNumber}
                              className="rounded-lg border border-slate-200 p-3.5 space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-900">
                                  0{step.stepNumber}. {step.title}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSendToMediaStudio(
                                      `Step ${step.stepNumber}: ${step.title}`,
                                      `${step.instruction} Important caution: ${step.cautionNote}`,
                                      "first-aid-steps"
                                    )
                                  }
                                  className="text-[11px] text-slate-500 hover:text-slate-900 underline whitespace-nowrap"
                                >
                                  Audio/Video for Step
                                </button>
                              </div>
                              <p className="text-xs text-slate-700 leading-relaxed">
                                {step.instruction}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                <strong className="text-slate-700">Note:</strong> {step.cautionNote}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Warning Signs Requiring Escalation */}
                      <div className="space-y-2 border-t border-slate-100 pt-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-red-900">
                            Warning Signs Requiring Medical Escalation
                          </h4>
                          <button
                            type="button"
                            onClick={() =>
                              handleSendToMediaStudio(
                                "Warning Signs for Medical Escalation",
                                assessment.warningSignsForEscalation.join(". "),
                                "warning-signs"
                              )
                            }
                            className="text-[11px] text-slate-500 hover:text-slate-900 underline whitespace-nowrap"
                          >
                            Create Audio Alert
                          </button>
                        </div>
                        <ul className="space-y-1.5 rounded-lg border border-red-200 bg-red-50/60 p-3.5 text-xs text-red-950">
                          {assessment.warningSignsForEscalation.map((sign, i) => (
                            <li key={i} className="leading-relaxed">
                              • {sign}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Explicit Image Limitations Note */}
                      <div className="border-t border-slate-100 pt-4 text-xs text-slate-500 space-y-1">
                        <p className="font-semibold text-slate-700">
                          Photographic &amp; Clinical Limitations:
                        </p>
                        <p className="leading-relaxed">{assessment.visualLimitationsNote}</p>
                      </div>

                      {/* Save to Private Encrypted Health Timeline & Local PDF Report Export */}
                      <div className="border-t border-slate-200 pt-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                            <Lock className="h-3.5 w-3.5 text-slate-700" />
                            Save to Encrypted Progress Timeline
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={newEntryDayLabel}
                              onChange={(e) => setNewEntryDayLabel(e.target.value)}
                              className="w-20 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-mono text-slate-900"
                              placeholder="Day 1"
                            />
                            <input
                              type="date"
                              value={newEntryIsoDate}
                              onChange={(e) => setNewEntryIsoDate(e.target.value)}
                              aria-label="Entry calendar date"
                              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-mono text-slate-900"
                            />
                            <button
                              type="button"
                              onClick={handleSaveCurrentToTimeline}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
                            >
                              <Plus className="h-3.5 w-3.5" /> Save Entry
                            </button>
                          </div>
                        </div>
                        {timelineSaveStatus && (
                          <p className="text-xs text-emerald-700 font-medium">
                            {timelineSaveStatus}
                          </p>
                        )}

                        <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs text-slate-600">
                            <span className="font-semibold text-slate-900">
                              Personal Record &amp; GP Handover:
                            </span>{" "}
                            Export assessment &amp; timeline as a local-only PDF.
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsExportPdfOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50 transition-colors whitespace-nowrap"
                          >
                            <FileDown className="h-3.5 w-3.5 text-slate-800" />
                            Export Local PDF for GP / Records
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Post-Assessment AI Consultation Chat Room & Nearest Hospital Referral Map */}
            <div id="consultation-referral-section">
              <PostDiagnosisChatAndReferral
                intake={intake}
                assessment={assessment}
                onSendToMediaStudio={(title, text) =>
                  handleSendToMediaStudio(title, text, "custom-selection")
                }
              />
            </div>

            {/* Embedded Audio & Video Studio right below the workbench for instant access */}
            <MediaCreationStudio
              selectedItems={selectedContents}
              activeItem={activeMediaItem}
              onSelectItem={(item) => setActiveMediaItem(item)}
              onAddCustomSelection={(title, text) =>
                handleSendToMediaStudio(title, text, "custom-selection")
              }
              patientPreviewImage={images[0]?.dataUrl}
            />
          </>
        )}

        {/* TAB 1B: DEDICATED AI CONSULTATION CHAT & NEAREST HOSPITAL REFERRAL */}
        {activeTab === "consultation" && (
          <div className="space-y-6">
            <PostDiagnosisChatAndReferral
              intake={intake}
              assessment={assessment}
              onSendToMediaStudio={(title, text) =>
                handleSendToMediaStudio(title, text, "custom-selection")
              }
            />
          </div>
        )}

        {/* TAB 2: PROGRESS TRACKING HEALTH TIMELINE (Day 1 -> Day 3 -> Day 7) */}
        {activeTab === "timeline" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Private Progress Tracking Timeline (Day 1 → Day 3 → Day 7)
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Compare chronological photos over time to observe visible surface changes while maintaining clinical caution.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-mono text-emerald-700 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" /> AES-256-GCM Encrypted at Rest
                </span>
                <button
                  type="button"
                  onClick={() => setIsExportPdfOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Export Timeline &amp; Assessment PDF
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("triage")}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  + Add New Timeline Photo
                </button>
              </div>
            </div>

            {timelineCases.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-12 text-center space-y-3">
                <Clock className="h-8 w-8 text-slate-400 mx-auto" />
                <h3 className="text-base font-semibold text-slate-900">
                  Your Private Health Timeline is Empty
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  After analyzing an image in the Image Assessment workspace, click &ldquo;Save Entry&rdquo; to track Day 1 → Day 3 → Day 7 progression.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Case Selector Tabs */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-1.5 rounded-lg bg-slate-200/70 p-1">
                    {timelineCases.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCaseId(c.id)}
                        className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          activeTimelineCase?.id === c.id
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {c.title}
                      </button>
                    ))}
                  </div>

                  {activeTimelineCase && activeTimelineCase.entries.length >= 2 && (
                    <button
                      type="button"
                      onClick={() => handleCompareTimelineProgression(activeTimelineCase)}
                      disabled={isComparingTimeline}
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {isComparingTimeline ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Comparing Progression...
                        </>
                      ) : (
                        <>
                          Compare Visible Changes ({activeTimelineCase.entries.map((e) => e.dayLabel).join(" → ")})
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Date-Picker Calendar & Visual Symptom Progression Summary */}
                {activeTimelineCase && (
                  <TimelineCalendarAndProgressionSummary
                    timelineCase={activeTimelineCase}
                    dateFilter={timelineDateFilter}
                    onChangeDateFilter={setTimelineDateFilter}
                    onSendProgressionToStudio={(title, summaryText) =>
                      handleSendToMediaStudio(title, summaryText, "timeline-comparison")
                    }
                  />
                )}

                {/* Active Date Filter Status Banner */}
                {activeTimelineCase && timelineDateFilter.mode !== "all" && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs">
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="font-mono font-semibold text-slate-900">
                        DATE FILTER ACTIVE:
                      </span>
                      {timelineDateFilter.mode === "single" ? (
                        <span>
                          Showing entries recorded on{" "}
                          <strong className="font-mono text-slate-900">
                            {formatIsoDateReadable(timelineDateFilter.selectedDate)}
                          </strong>{" "}
                          ({filteredTimelineEntries.length} of{" "}
                          {activeTimelineCase.entries.length} checkpoints)
                        </span>
                      ) : (
                        <span>
                          Showing entries from{" "}
                          <strong className="font-mono text-slate-900">
                            {timelineDateFilter.rangeStart || "Start"}
                          </strong>{" "}
                          to{" "}
                          <strong className="font-mono text-slate-900">
                            {timelineDateFilter.rangeEnd || "Latest"}
                          </strong>{" "}
                          ({filteredTimelineEntries.length} of{" "}
                          {activeTimelineCase.entries.length} checkpoints)
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setTimelineDateFilter({
                          mode: "all",
                          selectedDate: "",
                          rangeStart: "",
                          rangeEnd: "",
                        })
                      }
                      className="font-semibold text-slate-900 underline hover:text-slate-700"
                    >
                      Show All {activeTimelineCase.entries.length} Checkpoints
                    </button>
                  </div>
                )}

                {/* Timeline Cards Grid (Day 1 -> Day 3 -> Day 7) */}
                {activeTimelineCase && filteredTimelineEntries.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-2">
                    <p className="text-sm font-semibold text-slate-900">
                      No timeline entries match the selected date filter
                    </p>
                    <p className="text-xs text-slate-500">
                      Click another highlighted date on the calendar above or reset the date filter to view all checkpoints.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setTimelineDateFilter({
                          mode: "all",
                          selectedDate: "",
                          rangeStart: "",
                          rangeEnd: "",
                        })
                      }
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Show All Dates
                    </button>
                  </div>
                ) : (
                  activeTimelineCase && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {filteredTimelineEntries.map((entry, idx) => {
                        const entryIso = resolveEntryIsoDate(
                          entry,
                          activeTimelineCase.createdAt,
                          idx
                        );
                        return (
                          <div
                            key={entry.id}
                            className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 gap-2">
                                <span className="text-sm font-bold text-slate-900 font-mono tabular-nums">
                                  {entry.dayLabel}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="date"
                                    value={entryIso}
                                    onChange={(e) =>
                                      handleUpdateTimelineEntryDate(
                                        activeTimelineCase.id,
                                        entry.id,
                                        e.target.value
                                      )
                                    }
                                    aria-label={`Change date for ${entry.dayLabel}`}
                                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-mono text-slate-700 focus:border-slate-900 focus:outline-none"
                                  />
                                </div>
                              </div>
                              <div className="aspect-4/3 w-full bg-slate-900 overflow-hidden">
                                <img
                                  src={entry.imageDataUrl}
                                  alt={`${entry.dayLabel} progression view`}
                                  referrerPolicy="no-referrer"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div className="p-4 space-y-2.5 text-xs">
                                <div className="flex items-center justify-between text-slate-500 font-mono tabular-nums">
                                  <span>View: {entry.viewLabel}</span>
                                  <span>Pain: {entry.painLevel}/10</span>
                                </div>
                                <p className="text-slate-700 leading-relaxed">{entry.notes}</p>
                                <p className="text-slate-500">
                                  Patient-reported trend:{" "}
                                  <strong className="text-slate-800">
                                    {entry.progressionStatus}
                                  </strong>
                                </p>
                              </div>
                            </div>

                            <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50 flex items-center justify-between">
                              <span className="text-[11px] font-mono text-slate-500">
                                {entry.dateLabel}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteTimelineEntry(activeTimelineCase.id, entry.id)
                                }
                                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete Photo
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {/* AI Timeline Comparison Result */}
                {activeTimelineCase?.comparisonReport && (
                  <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <span className="text-xs font-mono text-slate-500">
                          AI CHRONOLOGICAL IMAGE COMPARISON
                        </span>
                        <h3 className="text-base font-bold text-slate-900 mt-0.5">
                          {activeTimelineCase.comparisonReport.timelineProgressionHeadline}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleSendToMediaStudio(
                            `Timeline Report: ${activeTimelineCase.title}`,
                            `${activeTimelineCase.comparisonReport?.timelineProgressionHeadline}. ${activeTimelineCase.comparisonReport?.visibleChangesSummary}`,
                            "timeline-comparison"
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
                      >
                        <Film className="h-3.5 w-3.5" /> Create Audio &amp; Video Summary
                      </button>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed">
                      {activeTimelineCase.comparisonReport.visibleChangesSummary}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activeTimelineCase.comparisonReport.dayByDayTransitions.map((tr, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-1 text-xs"
                        >
                          <p className="font-mono font-semibold text-slate-900">
                            {tr.intervalLabel}
                          </p>
                          <p className="text-slate-700 leading-relaxed">
                            {tr.observedVisualShift}
                          </p>
                          <p className="text-slate-500">{tr.symptomCorrelation}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950 space-y-1">
                      <p className="font-semibold">
                        Clinical Context &amp; When to Seek Professional Evaluation:
                      </p>
                      <p>{activeTimelineCase.comparisonReport.whenToSeekEvaluation}</p>
                      <p className="text-amber-800 mt-1">
                        Note: {activeTimelineCase.comparisonReport.lightingAndAngleCaveat}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DEDICATED AUDIO & VIDEO CREATION STUDIO FOR SELECTED CONTENTS */}
        {activeTab === "media-studio" && (
          <div className="space-y-6">
            <div className="border-b border-slate-200 pb-4">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Audio &amp; Video Creation Studio for Selected Contents
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Convert any selected assessment findings, first-aid steps, escalation warnings, or Day 1 → Day 7 timeline notes into downloadable voice narrations (.WAV) and animated visual walkthrough videos (.WebM).
              </p>
            </div>

            <MediaCreationStudio
              selectedItems={selectedContents}
              activeItem={activeMediaItem}
              onSelectItem={(item) => setActiveMediaItem(item)}
              onAddCustomSelection={(title, text) =>
                handleSendToMediaStudio(title, text, "custom-selection")
              }
              patientPreviewImage={
                images[0]?.dataUrl || activeTimelineCase?.entries?.[0]?.imageDataUrl
              }
            />
          </div>
        )}

        {/* TAB 4: PRIVACY, ENCRYPTION & DATA DELETION CONTROLS */}
        {activeTab === "privacy" && (
          <div className="space-y-6">
            <div className="border-b border-slate-200 pb-4">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Patient Image Privacy, Encryption &amp; Data Control
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Transparent safeguards for sensitive health photographs, encryption at rest, and permanent deletion.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <h2 className="text-base font-semibold text-slate-900">
                    How Your Patient Images Are Stored &amp; Used
                  </h2>
                </div>
                <ul className="space-y-2.5 text-xs text-slate-600 leading-relaxed">
                  <li>
                    • <strong className="text-slate-900">Explicit Consent First:</strong> No photograph is analyzed until you grant explicit consent in the intake workflow.
                  </li>
                  <li>
                    • <strong className="text-slate-900">Encryption in Transit &amp; at Rest:</strong> Images sent for live triage use TLS encryption in transit, and optional Progress Timeline entries are encrypted locally in your browser using 256-bit Web Crypto API (`AES-GCM`).
                  </li>
                  <li>
                    • <strong className="text-slate-900">Zero Unconsented AI Training:</strong> Patient photographs and symptom descriptions are strictly excluded from AI training datasets.
                  </li>
                  <li>
                    • <strong className="text-slate-900">Data Minimization &amp; Redaction:</strong> You can apply the built-in Privacy Mask to strip peripheral identifiers before analysis.
                  </li>
                </ul>

                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <label className="flex items-center justify-between text-xs font-medium text-slate-800">
                    <span>Require explicit consent before every image assessment</span>
                    <input
                      type="checkbox"
                      checked={hasExplicitConsent}
                      onChange={(e) => setHasExplicitConsent(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                  </label>
                  <label className="flex items-center justify-between text-xs font-medium text-slate-800">
                    <span>Do not use my images for AI training (Enforced)</span>
                    <input
                      type="checkbox"
                      checked={consentNonTraining}
                      onChange={(e) => setConsentNonTraining(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <h2 className="text-base font-semibold text-slate-900">
                    Permanent Image &amp; Health Data Deletion
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    You have full control to permanently delete individual images or wipe your entire encrypted Progress Timeline and cryptographic keys from this device immediately.
                  </p>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs space-y-1 font-mono tabular-nums">
                    <p>Active Session Photos: {images.length}</p>
                    <p>
                      Encrypted Timeline Photos:{" "}
                      {timelineCases.reduce((sum, c) => sum + c.entries.length, 0)}
                    </p>
                    <p>Cipher Suite: WebCrypto AES-256-GCM</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setImages([]);
                      setAssessment(null);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
                  >
                    Clear Active Session Images ({images.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      permanentlyPurgeAllHealthData();
                      setImages([]);
                      setTimelineCases([]);
                      setAssessment(null);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Permanently Delete All Images &amp; Keys
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Quiet Clinical Footer */}
      <footer className="border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500">
        <div className="mx-auto max-w-[1360px] flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Clarion Triage · Visual First-Aid Support System · Image supports assessment and never replaces a clinical examination.
          </span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveTab("privacy")}
              className="hover:text-slate-900 underline"
            >
              Privacy &amp; Data Deletion
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("media-studio")}
              className="hover:text-slate-900 underline"
            >
              Audio &amp; Video Studio
            </button>
          </div>
        </div>
      </footer>

      {/* Live WebRTC Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        defaultViewLabel={uploadViewLabel}
        onCapture={(dataUrl, viewLabel) => {
          addImageWithQualityCheck(dataUrl, viewLabel);
        }}
      />

      {/* Local-Only Clinical & GP PDF Report Export Modal */}
      <ExportPdfReportModal
        isOpen={isExportPdfOpen}
        onClose={() => setIsExportPdfOpen(false)}
        intake={intake}
        assessment={assessment}
        sessionImages={images}
        timelineCase={activeTimelineCase || null}
      />
    </div>
  );
}
