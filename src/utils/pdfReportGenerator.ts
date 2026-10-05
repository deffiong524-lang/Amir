import { jsPDF } from "jspdf";
import {
  PatientImageItem,
  PatientIntakeAnswers,
  TimelineCase,
  TriageAssessmentResult,
} from "../types/triage";

export interface PdfExportOptions {
  patientIdentifier: string;
  gpOrClinicName: string;
  notesForGp: string;
  includeIntakeAndAssessment: boolean;
  includeSessionPhotos: boolean;
  includeTimelineData: boolean;
  includeTimelinePhotos: boolean;
}

/**
 * Generates and downloads a multi-page, clinical-grade PDF report 100% locally
 * in the browser without transmitting any data to a server.
 */
export async function generateLocalClinicalPdfReport(params: {
  intake: PatientIntakeAnswers;
  assessment: TriageAssessmentResult | null;
  sessionImages: PatientImageItem[];
  timelineCase: TimelineCase | null;
  options: PdfExportOptions;
}): Promise<string> {
  const { intake, assessment, sessionImages, timelineCase, options } = params;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const marginX = 15;
  const contentWidth = pageWidth - marginX * 2;
  let y = 18;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 20) {
      doc.addPage();
      y = 18;
    }
  };

  const drawSectionHeader = (indexLabel: string, title: string) => {
    checkPageBreak(16);
    doc.setFillColor(241, 245, 249);
    doc.rect(marginX, y, contentWidth, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${indexLabel}  ${title.toUpperCase()}`, marginX + 3, y + 5.5);
    y += 12;
  };

  const writeWrappedParagraph = (
    text: string,
    fontSize = 9.5,
    fontStyle: "normal" | "bold" | "italic" = "normal",
    color: [number, number, number] = [30, 41, 59],
    indent = 0
  ) => {
    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines: string[] = doc.splitTextToSize(text, contentWidth - indent);
    const lineHeight = fontSize * 0.44;
    for (const line of lines) {
      checkPageBreak(lineHeight + 2);
      doc.text(line, marginX + indent, y);
      y += lineHeight;
    }
    y += 1.5;
  };

  // --- TOP CLINICAL BANNER ---
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 29, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("CLARION TRIAGE — PATIENT & GP CLINICAL SUMMARY REPORT", marginX, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  const generatedTimestamp = new Date().toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.text(
    `Generated Locally on Device (Zero-Cloud Export) · ${generatedTimestamp}`,
    marginX,
    18.5
  );
  doc.text(
    "Confidential Personal Health Record & General Practitioner (GP) Consultation Aid",
    marginX,
    24
  );

  y = 35;

  // --- MANDATORY MEDICAL DISCLAIMER BOX ---
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.rect(marginX, y, contentWidth, 15, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("IMPORTANT CLINICAL PHOTOGRAPH DISCLAIMER:", marginX + 3, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  const disclaimerLines = doc.splitTextToSize(
    "This AI system identifies visible surface features and provides cautious first-aid guidance, but it cannot reliably diagnose medical conditions from a photograph. This report is intended to support — not replace — an in-person examination by a qualified General Practitioner (GP) or healthcare professional.",
    contentWidth - 6
  );
  doc.text(disclaimerLines, marginX + 3, y + 9.2);
  y += 20;

  // --- PATIENT & GP CONSULTATION HEADER METADATA ---
  if (
    options.patientIdentifier.trim() ||
    options.gpOrClinicName.trim() ||
    options.notesForGp.trim()
  ) {
    drawSectionHeader("00.", "Patient & GP Consultation Details");
    if (options.patientIdentifier.trim()) {
      writeWrappedParagraph(
        `Patient Name / Reference: ${options.patientIdentifier.trim()}`,
        9.5,
        "bold"
      );
    }
    if (options.gpOrClinicName.trim()) {
      writeWrappedParagraph(
        `Prepared for GP / Clinic: ${options.gpOrClinicName.trim()}`,
        9.5,
        "normal"
      );
    }
    if (options.notesForGp.trim()) {
      writeWrappedParagraph(
        `Patient Note for GP: "${options.notesForGp.trim()}"`,
        9,
        "italic",
        [51, 65, 85]
      );
    }
    y += 2;
  }

  // --- SECTION 1: STRUCTURED PATIENT INTAKE ---
  if (options.includeIntakeAndAssessment) {
    drawSectionHeader("01.", "Patient Symptom Description & Intake Responses");

    const vccLabel = intake.customCondition?.trim()
      ? `${intake.customCondition.trim()} (Custom V.C.C. Input)`
      : intake.category;

    const intakeRows: [string, string][] = [
      ["Visible Condition Category (V.C.C.):", vccLabel],
      ["Affected Body Location:", intake.bodyLocation || "Not specified"],
      ["1. What happened?:", intake.whatHappened || "Not specified"],
      ["2. When did it happen?:", intake.whenHappened || "Not specified"],
      [
        "3. Is the area painful?:",
        `${intake.painStatus} (Pain Intensity: ${intake.painLevel}/10)`,
      ],
      ["4. Is there bleeding?:", intake.bleedingStatus],
      ["5. Condition trend:", intake.progressionStatus],
    ];
    if (intake.additionalNotes?.trim()) {
      intakeRows.push(["Additional Patient Notes:", intake.additionalNotes.trim()]);
    }

    for (const [label, val] of intakeRows) {
      checkPageBreak(10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(label, marginX, y);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      const valLines = doc.splitTextToSize(val, contentWidth - 62);
      doc.text(valLines, marginX + 62, y);
      y += Math.max(5.5, valLines.length * 4.3);
    }
    y += 3;

    // --- SECTION 2: AI FIRST-AID ASSESSMENT RESULT ---
    drawSectionHeader("02.", "Cautious AI First-Aid Assessment & Triage Summary");

    if (!assessment) {
      writeWrappedParagraph(
        "No AI assessment had been executed at the time this report was exported.",
        9,
        "italic",
        [100, 116, 139]
      );
    } else {
      // Urgency Banner Box
      checkPageBreak(22);
      const isHigh = assessment.isEmergency || assessment.urgencyLevel === "high";
      const isMed = assessment.urgencyLevel === "medium";

      if (isHigh) {
        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(220, 38, 38);
      } else if (isMed) {
        doc.setFillColor(255, 251, 235);
        doc.setDrawColor(217, 119, 6);
      } else {
        doc.setFillColor(236, 253, 245);
        doc.setDrawColor(22, 163, 74);
      }

      doc.rect(marginX, y, contentWidth, 16, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(
        isHigh ? 153 : isMed ? 146 : 6,
        isHigh ? 27 : isMed ? 64 : 95,
        isHigh ? 27 : isMed ? 14 : 70
      );

      const tierText = isHigh
        ? "URGENCY TIER: RED — POTENTIAL EMERGENCY (SEEK IMMEDIATE MEDICAL CARE)"
        : isMed
        ? "URGENCY TIER: AMBER — NEEDS MEDICAL EVALUATION"
        : "URGENCY TIER: GREEN — LOW CONCERN / BASIC FIRST AID";
      doc.text(tierText, marginX + 3, y + 6);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(assessment.urgencyTitle, marginX + 3, y + 12);
      y += 20;

      if (assessment.isEmergency && assessment.emergencyBannerMessage) {
        writeWrappedParagraph(
          `EMERGENCY ALERT: ${assessment.emergencyBannerMessage}`,
          9.5,
          "bold",
          [185, 28, 28]
        );
      }

      writeWrappedParagraph("Urgency Rationale:", 9.5, "bold");
      writeWrappedParagraph(assessment.urgencyRationale, 9, "normal");

      writeWrappedParagraph("Cautious Visual & Symptom Observation:", 9.5, "bold");
      writeWrappedParagraph(assessment.cautiousObservationSummary, 9, "normal");

      if (assessment.visibleCharacteristics?.length > 0) {
        writeWrappedParagraph("Observed Visible Characteristics:", 9.5, "bold");
        for (const vc of assessment.visibleCharacteristics) {
          writeWrappedParagraph(
            `• ${vc.feature} (${vc.imageReference}): ${vc.observation}`,
            8.8,
            "normal",
            [51, 65, 85],
            3
          );
        }
      }

      if (assessment.multiImageComparison) {
        writeWrappedParagraph("Multi-Image Comparison Notes:", 9.5, "bold");
        writeWrappedParagraph(assessment.multiImageComparison, 9, "normal");
      }

      if (assessment.firstAidSteps?.length > 0) {
        writeWrappedParagraph("Recommended First-Aid Care Steps:", 9.5, "bold");
        for (const step of assessment.firstAidSteps) {
          writeWrappedParagraph(
            `Step 0${step.stepNumber} — ${step.title}: ${step.instruction} (Caution: ${step.cautionNote})`,
            8.8,
            "normal",
            [30, 41, 59],
            3
          );
        }
      }

      if (assessment.warningSignsForEscalation?.length > 0) {
        writeWrappedParagraph(
          "Warning Signs Requiring Prompt Medical Escalation:",
          9.5,
          "bold",
          [153, 27, 27]
        );
        for (const sign of assessment.warningSignsForEscalation) {
          writeWrappedParagraph(`• ${sign}`, 8.8, "normal", [127, 29, 29], 3);
        }
      }

      if (assessment.questionsForClinician?.length > 0) {
        writeWrappedParagraph("Suggested Questions to Discuss with Your GP:", 9.5, "bold");
        for (const q of assessment.questionsForClinician) {
          writeWrappedParagraph(`• ${q}`, 8.8, "normal", [51, 65, 85], 3);
        }
      }

      if (assessment.visualLimitationsNote) {
        writeWrappedParagraph(
          `Photographic & Clinical Limitations: ${assessment.visualLimitationsNote}`,
          8.5,
          "italic",
          [100, 116, 139]
        );
      }
    }
  }

  // --- SECTION 3: CAPTURED PATIENT SESSION PHOTOGRAPHS ---
  if (options.includeSessionPhotos && sessionImages.length > 0) {
    drawSectionHeader(
      "03.",
      `Captured Patient Photographs (${sessionImages.length} Image${
        sessionImages.length > 1 ? "s" : ""
      })`
    );

    for (let i = 0; i < sessionImages.length; i++) {
      const imgItem = sessionImages[i];
      checkPageBreak(64);

      try {
        doc.setDrawColor(203, 213, 225);
        doc.rect(marginX, y, 64, 48);
        doc.addImage(imgItem.dataUrl, "JPEG", marginX + 1, y + 1, 62, 46);
      } catch {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.text("[Image preview could not be embedded]", marginX + 4, y + 24);
      }

      const metaX = marginX + 70;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `Photo #${i + 1} · ${imgItem.viewLabel}${
          imgItem.dayLabel ? ` (${imgItem.dayLabel})` : ""
        }`,
        metaX,
        y + 6
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Captured At: ${imgItem.capturedAt}`, metaX, y + 12);

      if (imgItem.qualityReport) {
        const qr = imgItem.qualityReport;
        doc.text(
          `Quality Verification: ${
            qr.overallPass ? "PASSED" : "RETAKE RECOMMENDED"
          } (Score: ${qr.qualityScore}/100)`,
          metaX,
          y + 18
        );
        const summaryLines = doc.splitTextToSize(
          qr.overallPass ? qr.lightingSummary : qr.retakeGuidance,
          contentWidth - 72
        );
        doc.text(summaryLines, metaX, y + 24);
      }

      y += 54;
    }
  }

  // --- SECTION 4: CHRONOLOGICAL PROGRESS TIMELINE DATA (Day 1 -> Day 3 -> Day 7) ---
  if (options.includeTimelineData && timelineCase && timelineCase.entries.length > 0) {
    drawSectionHeader(
      "04.",
      `Progress Tracking Health Timeline: ${timelineCase.title}`
    );

    writeWrappedParagraph(
      `Condition Category: ${timelineCase.category} · Total Recorded Checkpoints: ${
        timelineCase.entries.length
      } (${timelineCase.entries.map((e) => e.dayLabel).join(" -> ")})`,
      9,
      "bold"
    );

    for (let i = 0; i < timelineCase.entries.length; i++) {
      const entry = timelineCase.entries[i];
      const boxHeight = options.includeTimelinePhotos ? 46 : 22;
      checkPageBreak(boxHeight + 6);

      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, y, contentWidth, boxHeight, "FD");

      let textStartX = marginX + 4;
      if (options.includeTimelinePhotos && entry.imageDataUrl) {
        try {
          doc.addImage(entry.imageDataUrl, "JPEG", marginX + 2, y + 2, 52, 42);
          textStartX = marginX + 58;
        } catch {
          // fallback if image fails
        }
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `${entry.dayLabel} (${entry.dateLabel}) — View: ${entry.viewLabel}`,
        textStartX,
        y + 7
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      doc.text(
        `Pain Level: ${entry.painLevel}/10 · Reported Trend: ${entry.progressionStatus}`,
        textStartX,
        y + 13
      );

      const noteLines = doc.splitTextToSize(
        `Notes: ${entry.notes}`,
        contentWidth - (textStartX - marginX) - 4
      );
      doc.text(noteLines, textStartX, y + 19);

      y += boxHeight + 4;
    }

    // Include AI Timeline Comparison Report if available
    if (timelineCase.comparisonReport) {
      const cr = timelineCase.comparisonReport;
      y += 2;
      writeWrappedParagraph(
        `Timeline Progression Analysis: ${cr.timelineProgressionHeadline}`,
        9.5,
        "bold"
      );
      writeWrappedParagraph(cr.visibleChangesSummary, 9, "normal");

      for (const tr of cr.dayByDayTransitions) {
        writeWrappedParagraph(
          `• ${tr.intervalLabel}: ${tr.observedVisualShift} (${tr.symptomCorrelation})`,
          8.8,
          "normal",
          [51, 65, 85],
          3
        );
      }

      writeWrappedParagraph(
        `When to Seek GP / Clinical Evaluation: ${cr.whenToSeekEvaluation}`,
        8.8,
        "bold",
        [146, 64, 14]
      );
      writeWrappedParagraph(
        `Comparison Caveat: ${cr.lightingAndAngleCaveat}`,
        8.2,
        "italic",
        [100, 116, 139]
      );
    }
  }

  // --- FOOTER ON ALL PAGES ---
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      "Clarion Triage · Local-Only Encrypted Health Export · Not a Confirmed Medical Diagnosis",
      marginX,
      pageHeight - 7.5
    );
    doc.text(
      `Page ${p} of ${totalPages}`,
      pageWidth - marginX - 18,
      pageHeight - 7.5
    );
  }

  const cleanCategory = (intake.customCondition?.trim() || intake.category || "report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const dateSlug = new Date().toISOString().slice(0, 10);
  const filename = `clarion-clinical-report-${cleanCategory}-${dateSlug}.pdf`;

  doc.save(filename);
  return filename;
}
