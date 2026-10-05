import React, { useState } from "react";
import {
  FileDown,
  Lock,
  CheckCircle2,
  X,
  ShieldCheck,
  FileText,
} from "lucide-react";
import {
  PatientImageItem,
  PatientIntakeAnswers,
  TimelineCase,
  TriageAssessmentResult,
} from "../types/triage";
import {
  generateLocalClinicalPdfReport,
  PdfExportOptions,
} from "../utils/pdfReportGenerator";

interface ExportPdfReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  intake: PatientIntakeAnswers;
  assessment: TriageAssessmentResult | null;
  sessionImages: PatientImageItem[];
  timelineCase: TimelineCase | null;
}

export const ExportPdfReportModal: React.FC<ExportPdfReportModalProps> = ({
  isOpen,
  onClose,
  intake,
  assessment,
  sessionImages,
  timelineCase,
}) => {
  const [options, setOptions] = useState<PdfExportOptions>({
    patientIdentifier: "",
    gpOrClinicName: "",
    notesForGp: "",
    includeIntakeAndAssessment: true,
    includeSessionPhotos: true,
    includeTimelineData: true,
    includeTimelinePhotos: true,
  });

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportedFilename, setExportedFilename] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGeneratePdf = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsExporting(true);
    setExportError(null);
    setExportedFilename(null);
    try {
      const filename = await generateLocalClinicalPdfReport({
        intake,
        assessment,
        sessionImages,
        timelineCase,
        options,
      });
      setExportedFilename(filename);
    } catch (err: any) {
      setExportError(err?.message || "Failed to generate local PDF report.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <FileText className="h-5 w-5 text-slate-900" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Export Local-Only Clinical &amp; GP PDF Report
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Compiled 100% locally in your browser for personal records or sharing with your General Practitioner (GP).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            aria-label="Close export modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleGeneratePdf} className="p-6 space-y-5">
          {/* Local-Only Security Guarantee Banner */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-950 flex items-start gap-2.5">
            <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                Zero-Cloud Local PDF Compilation
              </p>
              <p className="text-emerald-800 mt-0.5 leading-relaxed">
                Your assessment result, intake answers, and encrypted timeline photos are assembled directly inside your browser memory into a downloadable PDF file. Nothing is uploaded to external servers during export.
              </p>
            </div>
          </div>

          {/* Optional Patient & GP Consultation Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Patient Name or Initials (Optional)
              </label>
              <input
                type="text"
                value={options.patientIdentifier}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    patientIdentifier: e.target.value,
                  }))
                }
                placeholder="e.g., J. Doe · DOB 1988-04-12"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                GP Name or Medical Clinic (Optional)
              </label>
              <input
                type="text"
                value={options.gpOrClinicName}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    gpOrClinicName: e.target.value,
                  }))
                }
                placeholder="e.g., Dr. S. Patel · City Family Practice"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Additional Context or Questions for Your GP (Optional)
            </label>
            <textarea
              rows={2}
              value={options.notesForGp}
              onChange={(e) =>
                setOptions((prev) => ({ ...prev, notesForGp: e.target.value }))
              }
              placeholder="Add any medications taken, allergies, or specific questions you want your GP to review..."
              className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
            />
          </div>

          {/* Report Sections Selection */}
          <div className="space-y-2.5 border-t border-slate-200 pt-4">
            <span className="block text-xs font-semibold text-slate-900">
              Select Sections to Include in PDF Report
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={options.includeIntakeAndAssessment}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      includeIntakeAndAssessment: e.target.checked,
                    }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900"
                />
                <div>
                  <p className="font-semibold text-slate-900">
                    Current Assessment &amp; Intake Q&amp;A
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    Urgency tier, cautious observations, first-aid steps, and warning signs.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={options.includeSessionPhotos}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      includeSessionPhotos: e.target.checked,
                    }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900"
                />
                <div>
                  <p className="font-semibold text-slate-900">
                    Current Session Photos ({sessionImages.length})
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    Embeds uploaded/camera photos and quality check metrics.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={options.includeTimelineData}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      includeTimelineData: e.target.checked,
                    }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900"
                />
                <div>
                  <p className="font-semibold text-slate-900">
                    Progress Timeline Data ({timelineCase?.entries.length || 0} Checkpoints)
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    Chronological Day 1 → Day 3 → Day 7 notes, pain levels, and AI comparison.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={options.includeTimelinePhotos}
                  disabled={!options.includeTimelineData}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      includeTimelinePhotos: e.target.checked,
                    }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 disabled:opacity-40"
                />
                <div>
                  <p className="font-semibold text-slate-900">
                    Embed Timeline Progression Photos
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    Includes side-by-side thumbnail images for each recorded day.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {exportError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {exportError}
            </div>
          )}

          {exportedFilename && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Downloaded local PDF report: <strong className="font-mono">{exportedFilename}</strong>
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <span className="text-xs text-slate-500 flex items-center gap-1.5 font-mono">
              <Lock className="h-3.5 w-3.5 text-slate-600" />
              100% Local Browser Generation
            </span>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={isExporting}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <FileDown className="h-4 w-4" />
                {isExporting ? "Generating Local PDF..." : "Download PDF Report"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
