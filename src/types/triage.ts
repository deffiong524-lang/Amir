export const SUPPORTED_CONDITION_CATEGORIES = [
  "Cuts and wounds",
  "Bleeding",
  "Burns",
  "Bruising",
  "Swelling",
  "Rashes",
  "Skin irritation",
  "Insect bites and stings",
  "Minor infections or possible signs of infection",
  "Eye-area swelling or visible irritation",
  "Sports injuries",
  "Possible dislocations or abnormal positioning",
  "Visible foreign objects",
  "Nail injuries",
  "Minor animal bites",
  "Other externally visible injuries",
] as const;

export type SupportedConditionCategory = (typeof SUPPORTED_CONDITION_CATEGORIES)[number];

export type ImageViewLabel =
  | "Front view"
  | "Side view"
  | "Close-up"
  | "Comparison with an earlier image";

export interface ImageQualityReport {
  overallPass: boolean;
  qualityScore: number;
  isTooDark: boolean;
  isBlurry: boolean;
  isTooFarAway: boolean;
  isObstructed: boolean;
  isWrongBodyArea: boolean;
  isTooLowResolution: boolean;
  hasIdentifyingInfoWarning: boolean;
  detectedIssues: string[];
  lightingSummary: string;
  retakeGuidance: string;
  width?: number;
  height?: number;
  meanLuminance?: number;
}

export interface PatientImageItem {
  id: string;
  dataUrl: string;
  viewLabel: ImageViewLabel;
  dayLabel?: string;
  capturedAt: string;
  qualityReport?: ImageQualityReport;
  isCheckingQuality?: boolean;
  privacyRedacted?: boolean;
}

export interface PatientIntakeAnswers {
  category: SupportedConditionCategory | string;
  customCondition?: string;
  bodyLocation: string;
  whatHappened: string;
  whenHappened: string;
  painStatus: "No pain" | "Mild discomfort" | "Moderate pain" | "Severe pain";
  painLevel: number;
  bleedingStatus:
    | "No bleeding"
    | "Minor / stopped bleeding"
    | "Slow oozing / controlled"
    | "Significant or uncontrolled bleeding";
  progressionStatus:
    | "Getting better"
    | "Staying the same"
    | "Getting worse"
    | "Just happened / unsure";
  additionalNotes: string;
}

export interface VisibleCharacteristic {
  feature: string;
  observation: string;
  imageReference: string;
}

export interface FirstAidStep {
  stepNumber: number;
  title: string;
  instruction: string;
  cautionNote: string;
}

export interface TriageAssessmentResult {
  urgencyLevel: "low" | "medium" | "high";
  urgencyTitle: string;
  urgencyRationale: string;
  isEmergency: boolean;
  emergencyBannerMessage: string;
  unreliableImageQuality: boolean;
  cautiousObservationSummary: string;
  visibleCharacteristics: VisibleCharacteristic[];
  multiImageComparison: string;
  firstAidSteps: FirstAidStep[];
  warningSignsForEscalation: string[];
  visualLimitationsNote: string;
  questionsForClinician: string[];
}

export interface TimelineEntry {
  id: string;
  dayLabel: string; // e.g., "Day 1", "Day 3", "Day 7"
  dateLabel: string;
  isoDate?: string; // YYYY-MM-DD format for calendar filtering & progression charting
  imageDataUrl: string;
  viewLabel: ImageViewLabel;
  painLevel: number;
  progressionStatus: string;
  notes: string;
  assessmentSummary?: string;
  urgencyLevel?: "low" | "medium" | "high";
}

export interface TimelineCase {
  id: string;
  title: string;
  category: SupportedConditionCategory | string;
  createdAt: string;
  encryptedAtRest: boolean;
  entries: TimelineEntry[];
  comparisonReport?: TimelineComparisonReport;
}

export interface TimelineComparisonReport {
  timelineProgressionHeadline: string;
  visibleChangesSummary: string;
  dayByDayTransitions: {
    intervalLabel: string;
    observedVisualShift: string;
    symptomCorrelation: string;
  }[];
  lightingAndAngleCaveat: string;
  whenToSeekEvaluation: string;
}

export interface MediaScene {
  sceneNumber: number;
  heading: string;
  keyBullet: string;
  cautionCallout: string;
  durationSeconds: number;
  visualIconType: "cleanse" | "protect" | "monitor" | "escalate" | "timeline";
}

export interface MediaStoryboard {
  videoTitle: string;
  fullNarrationScript: string;
  scenes: MediaScene[];
}

export interface SelectedContentItem {
  id: string;
  title: string;
  sourceType: "observation" | "first-aid-steps" | "warning-signs" | "timeline-comparison" | "custom-selection";
  content: string;
  urgencyLevel?: "low" | "medium" | "high";
}

export interface PatientLocation {
  lat: number;
  lng: number;
  label: string;
  source: "gps" | "search" | "default";
}

export interface HospitalFacility {
  id: string;
  displayName: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  googleMapsURI?: string;
  websiteURI?: string;
  isOpenNow?: boolean;
  distanceKm?: number;
}

export interface GroundingMapLink {
  title: string;
  uri: string;
  reviewSnippets?: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isReferralAlert?: boolean;
  mapLinks?: GroundingMapLink[];
  referredHospitals?: HospitalFacility[];
}
