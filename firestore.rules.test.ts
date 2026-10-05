/**
 * Firestore Security Rules Verification Specification
 * Tests all "Dirty Dozen" adversarial payloads against Care Aid Ai rules.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collection: string;
  operation: "get" | "list" | "create" | "update" | "delete";
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: "PERMISSION_DENIED" | "ALLOWED";
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: "Identity Spoofing on Encrypted Image Upload",
    collection: "/encrypted_images/img_spoof_1",
    operation: "create",
    auth: { uid: "attacker_1", email: "attacker@example.com", email_verified: true },
    payload: { ownerUid: "victim_1", cipherAlgorithm: "AES-256-GCM" },
    expectedResult: "PERMISSION_DENIED",
  },
  {
    id: 2,
    name: "Unconsented Image Upload (Non-existent consentId)",
    collection: "/encrypted_images/img_no_consent",
    operation: "create",
    auth: { uid: "patient_1", email: "patient@example.com", email_verified: true },
    payload: { ownerUid: "patient_1", consentId: "missing_consent_doc" },
    expectedResult: "PERMISSION_DENIED",
  },
  {
    id: 3,
    name: "Revoked Consent Image Upload",
    collection: "/encrypted_images/img_revoked_consent",
    operation: "create",
    auth: { uid: "patient_1", email: "patient@example.com", email_verified: true },
    payload: { ownerUid: "patient_1", consentId: "revoked_consent_id" },
    expectedResult: "PERMISSION_DENIED",
  },
  {
    id: 4,
    name: "Shadow Field Injection on Image Update",
    collection: "/encrypted_images/img_valid_1",
    operation: "update",
    auth: { uid: "patient_1", email: "patient@example.com", email_verified: true },
    payload: { status: "flagged_for_review", isVerifiedByDoctor: true },
    expectedResult: "PERMISSION_DENIED",
  },
  {
    id: 5,
    name: "Cipher Downgrade Attack (Non-AES-256-GCM)",
    collection: "/encrypted_images/img_plaintext",
    operation: "create",
    auth: { uid: "patient_1", email: "patient@example.com", email_verified: true },
    payload: { ownerUid: "patient_1", cipherAlgorithm: "NONE" },
    expectedResult: "PERMISSION_DENIED",
  },
  {
    id: 6,
    name: "Denial of Wallet Oversized String Attack",
    collection: "/encrypted_images/img_oversized",
    operation: "create",
    auth: { uid: "patient_1", email: "patient@example.com", email_verified: true },
    payload: { ownerUid: "patient_1", caseTitle: "A".repeat(5000) },
    expectedResult: "PERMISSION_DENIED",
  },
  {
    id: 7,
    name: "Forged Past Timestamp on Consent Creation",
    collection: "/consents/patient_1",
    operation: "create",
    auth: { uid: "patient_1", email: "patient@example.com", email_verified: true },
    payload: { patientUid: "patient_1", createdAt: "2020-01-01T00:00:00Z" },
    expectedResult: "PERMISSION_DENIED",
  },
  {
    id: 8,
    name: "Immutable OwnerUid Mutation on Update",
    collection: "/encrypted_images/img_valid_1",
    operation: "update",
    auth: { uid: "patient_1", email: "patient@example.com", email_verified: true },
    payload: { ownerUid: "another_user", status: "flagged_for_review" },
    expectedResult: "PERMISSION_DENIED",
  },
  {
    id: 9,
    name: "Self-Assigned Authorized Personnel Privilege Escalation",
    collection: "/authorized_personnel/attacker_1",
    operation: "create",
    auth: { uid: "attacker_1", email: "attacker@example.com", email_verified: true },
    payload: { uid: "attacker_1", role: "chief_medical_admin" },
    expectedResult: "PERMISSION_DENIED",
  },
  {
    id: 10,
    name: "Unverified Admin Email Spoofing Attack",
    collection: "/authorized_personnel/staff_1",
    operation: "create",
    auth: { uid: "spoof_admin", email: "deffiong524@gmail.com", email_verified: false },
    payload: { uid: "staff_1", role: "triage_clinician" },
    expectedResult: "PERMISSION_DENIED",
  },
  {
    id: 11,
    name: "Cross-Patient Unauthorized Image Read",
    collection: "/encrypted_images/img_patient_2",
    operation: "get",
    auth: { uid: "patient_1", email: "patient1@example.com", email_verified: true },
    expectedResult: "PERMISSION_DENIED",
  },
  {
    id: 12,
    name: "Immutable Security Audit Log Deletion Attempt",
    collection: "/security_audit_logs/log_1",
    operation: "delete",
    auth: { uid: "deffiong524", email: "deffiong524@gmail.com", email_verified: true },
    expectedResult: "PERMISSION_DENIED",
  },
];
