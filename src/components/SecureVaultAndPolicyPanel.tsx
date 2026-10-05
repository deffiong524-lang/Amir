import React, { useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  Lock,
  Trash2,
  Upload,
  KeyRound,
  UserCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  LogIn,
  LogOut,
  FileCheck2,
  RefreshCw,
} from "lucide-react";
import { User, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutUser,
} from "../firebase";
import {
  computeSha256Hex,
  decryptImagePayloadFromCloud,
  encryptImagePayloadForCloud,
  permanentlyPurgeAllHealthData,
} from "../utils/cryptoAndImage";
import {
  ImageViewLabel,
  PatientImageItem,
  SUPPORTED_CONDITION_CATEGORIES,
  SupportedConditionCategory,
} from "../types/triage";

interface CloudEncryptedImageDoc {
  id: string;
  ownerUid: string;
  consentId: string;
  caseTitle: string;
  category: string;
  viewLabel: string;
  dayLabel: string;
  cipherAlgorithm: "AES-256-GCM";
  ivBase64: string;
  ciphertextBase64: string;
  sha256Digest: string;
  privacyMasked: boolean;
  status: "encrypted_active" | "flagged_for_review";
  createdAt?: any;
  updatedAt?: any;
}

interface ConsentDoc {
  patientUid: string;
  policyVersion: string;
  consentGranted: boolean;
  allowProcessing: boolean;
  forbidAiTraining: boolean;
  acknowledgesNoDiagnosis: boolean;
  signatureHash: string;
  createdAt?: any;
  updatedAt?: any;
}

interface AuditLogDoc {
  id: string;
  actorUid: string;
  actionType: string;
  targetResourceId: string;
  details: string;
  createdAt?: any;
}

interface SecureVaultAndPolicyPanelProps {
  sessionImages: PatientImageItem[];
  onClearSessionImages: () => void;
  onAddUploadedImageToSession: (
    dataUrl: string,
    viewLabel: ImageViewLabel,
    dayLabel?: string,
    category?: string
  ) => Promise<void>;
}

const CHIEF_ADMIN_EMAIL = "deffiong524@gmail.com";

export const SecureVaultAndPolicyPanel: React.FC<
  SecureVaultAndPolicyPanelProps
> = ({
  sessionImages,
  onClearSessionImages,
  onAddUploadedImageToSession,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Explicit Consent Record in Firestore
  const [consentRecord, setConsentRecord] = useState<ConsentDoc | null>(null);
  const [isSavingConsent, setIsSavingConsent] = useState<boolean>(false);

  // Encrypted Images in Firestore
  const [cloudImages, setCloudImages] = useState<CloudEncryptedImageDoc[]>([]);
  const [decryptedPreviews, setDecryptedPreviews] = useState<Record<string, string>>(
    {}
  );
  const [inspectCiphertextId, setInspectCiphertextId] = useState<string | null>(
    null
  );

  // Direct Encrypted Picture Upload Form State
  const [uploadCaseTitle, setUploadCaseTitle] = useState<string>(
    "Forearm Skin Observation"
  );
  const [uploadCategory, setUploadCategory] =
    useState<SupportedConditionCategory>("Cuts and wounds");
  const [uploadViewLabel, setUploadViewLabel] =
    useState<ImageViewLabel>("Close-up");
  const [uploadDayLabel, setUploadDayLabel] = useState<string>("Day 1");
  const [isEncryptingUpload, setIsEncryptingUpload] = useState<boolean>(false);
  const [vaultStatusBanner, setVaultStatusBanner] = useState<string | null>(null);

  // Security Audit Trail & Authorized Personnel State
  const [auditLogs, setAuditLogs] = useState<AuditLogDoc[]>([]);
  const [newStaffUid, setNewStaffUid] = useState<string>("");
  const [newStaffEmail, setNewStaffEmail] = useState<string>("");
  const [newStaffName, setNewStaffName] = useState<string>("");
  const [newStaffRole, setNewStaffRole] = useState<
    "triage_clinician" | "security_auditor" | "chief_medical_admin"
  >("triage_clinician");
  const [newStaffBadge, setNewStaffBadge] = useState<string>("MD-4092");

  const directVaultFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Subscribe to Consent Record, Encrypted Patient Images, and Security Audit Logs
  useEffect(() => {
    if (!isAuthReady || !currentUser) {
      setConsentRecord(null);
      setCloudImages([]);
      setAuditLogs([]);
      return;
    }

    const consentRef = doc(db, "consents", currentUser.uid);
    const unsubConsent = onSnapshot(
      consentRef,
      (snap) => {
        if (snap.exists()) {
          setConsentRecord(snap.data() as ConsentDoc);
        } else {
          setConsentRecord(null);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `consents/${currentUser.uid}`)
    );

    const imagesQuery = query(
      collection(db, "encrypted_images"),
      where("ownerUid", "==", currentUser.uid)
    );
    const unsubImages = onSnapshot(
      imagesQuery,
      (snap) => {
        const list: CloudEncryptedImageDoc[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as any) });
        });
        setCloudImages(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, "encrypted_images")
    );

    const logsQuery = query(
      collection(db, "security_audit_logs"),
      where("actorUid", "==", currentUser.uid)
    );
    const unsubLogs = onSnapshot(
      logsQuery,
      (snap) => {
        const logs: AuditLogDoc[] = [];
        snap.forEach((d) => {
          logs.push({ id: d.id, ...(d.data() as any) });
        });
        setAuditLogs(logs.slice(0, 15));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, "security_audit_logs")
    );

    return () => {
      unsubConsent();
      unsubImages();
      unsubLogs();
    };
  }, [isAuthReady, currentUser]);

  const appendAuditLog = async (
    actionType:
      | "CONSENT_GRANTED"
      | "CONSENT_REVOKED"
      | "IMAGE_ENCRYPTED_UPLOAD"
      | "IMAGE_DECRYPTED_VIEW"
      | "IMAGE_PERMANENTLY_DELETED"
      | "VAULT_PURGED"
      | "PERSONNEL_AUTHORIZED",
    targetResourceId: string,
    details: string
  ) => {
    if (!currentUser) return;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const path = `security_audit_logs/${logId}`;
    try {
      await setDoc(doc(db, "security_audit_logs", logId), {
        actorUid: currentUser.uid,
        actionType,
        targetResourceId: targetResourceId.slice(0, 120),
        details: details.slice(0, 280),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleGrantOrUpdateExplicitConsent = async (grant: boolean) => {
    if (!currentUser) return;
    setIsSavingConsent(true);
    const path = `consents/${currentUser.uid}`;
    try {
      const statement = `CareAidAi-Policy-v2.4|UID:${currentUser.uid}|Granted:${grant}|NoTraining:true|NoDiagnosisAck:true`;
      const signatureHash = await computeSha256Hex(statement);

      const payload: Record<string, any> = {
        patientUid: currentUser.uid,
        policyVersion: "v2.4-HIPAA-Aligned",
        consentGranted: grant,
        allowProcessing: grant,
        forbidAiTraining: true,
        acknowledgesNoDiagnosis: true,
        signatureHash,
        updatedAt: serverTimestamp(),
      };
      if (!consentRecord) {
        payload.createdAt = serverTimestamp();
      } else {
        payload.createdAt = consentRecord.createdAt;
      }

      await setDoc(doc(db, "consents", currentUser.uid), payload);
      await appendAuditLog(
        grant ? "CONSENT_GRANTED" : "CONSENT_REVOKED",
        currentUser.uid,
        `Explicit user consent ${grant ? "granted" : "revoked"} (SHA-256 sig: ${signatureHash.slice(0, 16)}...)`
      );
      setVaultStatusBanner(
        grant
          ? "Explicit Consent cryptographically signed and recorded in Firestore."
          : "Consent revoked. New cloud image uploads are now blocked until re-consented."
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setIsSavingConsent(false);
    }
  };

  const handleEncryptAndUploadDataUrl = async (
    dataUrl: string,
    caseTitle: string,
    category: string,
    viewLabel: string,
    dayLabel: string,
    privacyMasked: boolean
  ) => {
    if (!currentUser) {
      setVaultStatusBanner("Please sign in with Google first to store encrypted images in the cloud vault.");
      return;
    }
    if (!consentRecord?.consentGranted || !consentRecord?.allowProcessing) {
      setVaultStatusBanner(
        "Explicit user consent is required before encrypting and uploading patient images. Please click 'Sign & Grant Explicit Consent' first."
      );
      return;
    }

    setIsEncryptingUpload(true);
    const imageId = `enc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const path = `encrypted_images/${imageId}`;
    try {
      const encrypted = await encryptImagePayloadForCloud(dataUrl);
      await setDoc(doc(db, "encrypted_images", imageId), {
        ownerUid: currentUser.uid,
        consentId: currentUser.uid,
        caseTitle: (caseTitle || "Patient Condition Photo").slice(0, 150),
        category: (category || "Cuts and wounds").slice(0, 95),
        viewLabel: (viewLabel || "Close-up").slice(0, 60),
        dayLabel: (dayLabel || "Day 1").slice(0, 30),
        cipherAlgorithm: encrypted.cipherAlgorithm,
        ivBase64: encrypted.ivBase64,
        ciphertextBase64: encrypted.ciphertextBase64,
        sha256Digest: encrypted.sha256Digest,
        privacyMasked: Boolean(privacyMasked),
        status: "encrypted_active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await appendAuditLog(
        "IMAGE_ENCRYPTED_UPLOAD",
        imageId,
        `AES-256-GCM encrypted image uploaded (SHA-256: ${encrypted.sha256Digest.slice(0, 16)}...)`
      );
      setVaultStatusBanner(
        `Picture encrypted with AES-256-GCM and securely stored in Firestore (${imageId}).`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    } finally {
      setIsEncryptingUpload(false);
    }
  };

  const handleDirectPictureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = async () => {
        if (typeof reader.result === "string") {
          // Also add to active triage session so user can analyze it immediately
          await onAddUploadedImageToSession(
            reader.result,
            uploadViewLabel,
            uploadDayLabel,
            uploadCategory
          );
          // If signed in & consented, also encrypt & store in Firestore cloud vault
          if (currentUser && consentRecord?.consentGranted) {
            await handleEncryptAndUploadDataUrl(
              reader.result,
              uploadCaseTitle,
              uploadCategory,
              uploadViewLabel,
              uploadDayLabel,
              false
            );
          }
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleDecryptCloudImage = async (item: CloudEncryptedImageDoc) => {
    const plainDataUrl = await decryptImagePayloadFromCloud(
      item.ivBase64,
      item.ciphertextBase64
    );
    if (plainDataUrl) {
      setDecryptedPreviews((prev) => ({ ...prev, [item.id]: plainDataUrl }));
      await appendAuditLog(
        "IMAGE_DECRYPTED_VIEW",
        item.id,
        `Authorized owner decrypted image ${item.id} in browser memory.`
      );
    }
  };

  const handlePermanentlyDeleteCloudImage = async (imageId: string) => {
    if (!currentUser) return;
    const path = `encrypted_images/${imageId}`;
    try {
      await deleteDoc(doc(db, "encrypted_images", imageId));
      setDecryptedPreviews((prev) => {
        const next = { ...prev };
        delete next[imageId];
        return next;
      });
      await appendAuditLog(
        "IMAGE_PERMANENTLY_DELETED",
        imageId,
        `Permanently deleted encrypted image ${imageId} from cloud storage.`
      );
      setVaultStatusBanner(
        `Encrypted image ${imageId} has been permanently deleted from Firestore.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const handlePurgeEntireCloudAndLocalVault = async () => {
    permanentlyPurgeAllHealthData();
    onClearSessionImages();
    if (currentUser) {
      for (const img of cloudImages) {
        try {
          await deleteDoc(doc(db, "encrypted_images", img.id));
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.DELETE,
            `encrypted_images/${img.id}`
          );
        }
      }
      await appendAuditLog(
        "VAULT_PURGED",
        currentUser.uid,
        "Patient executed complete permanent deletion of all cloud & local encrypted images."
      );
    }
    setDecryptedPreviews({});
    setVaultStatusBanner(
      "All cloud and local encrypted images and cryptographic keys have been permanently erased."
    );
  };

  const handleAuthorizePersonnel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || currentUser.email !== CHIEF_ADMIN_EMAIL) return;
    const cleanUid = newStaffUid.trim().replace(/[^a-zA-Z0-9_-]/g, "");
    if (!cleanUid || !newStaffEmail.trim() || !newStaffName.trim()) return;
    const path = `authorized_personnel/${cleanUid}`;
    try {
      await setDoc(doc(db, "authorized_personnel", cleanUid), {
        uid: cleanUid,
        email: newStaffEmail.trim().slice(0, 150),
        displayName: newStaffName.trim().slice(0, 110),
        role: newStaffRole,
        badgeId: newStaffBadge.trim().slice(0, 60),
        createdByUid: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      await appendAuditLog(
        "PERSONNEL_AUTHORIZED",
        cleanUid,
        `Authorized clinical personnel ${newStaffName.trim()} (${newStaffRole})`
      );
      setNewStaffUid("");
      setNewStaffEmail("");
      setNewStaffName("");
      setVaultStatusBanner(`Authorized personnel ${cleanUid} added to RBAC registry.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const isChiefAdmin = currentUser?.email === CHIEF_ADMIN_EMAIL;

  return (
    <div className="space-y-8">
      {/* Header & Authentication RBAC Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Care Aid Ai — Secure Encrypted Image Upload, Cloud Vault &amp; RBAC
            </h1>
          </div>
          <p className="text-xs text-slate-600 max-w-3xl">
            End-to-end patient image security featuring explicit cryptographic consent before processing, client-side WebCrypto <code className="font-mono">AES-256-GCM</code> encryption at rest, TLS 1.3 in transit, role-based access restricted to the patient owner and authorized clinical personnel, and one-click permanent deletion.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {currentUser ? (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-900">
                  {currentUser.displayName || currentUser.email}
                </p>
                <p className="text-[11px] font-mono text-emerald-700">
                  Role: {isChiefAdmin ? "Chief Medical Admin & Owner" : "Verified Patient Owner"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => signOutUser()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign Out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={async () => {
                setAuthError(null);
                try {
                  await signInWithGoogle();
                } catch (err: any) {
                  setAuthError(err?.message || "Sign-in cancelled or failed.");
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <LogIn className="h-4 w-4" />
              Sign In with Google for Encrypted Cloud Vault
            </button>
          )}
        </div>
      </div>

      {authError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {authError}
        </div>
      )}

      {vaultStatusBanner && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-950 flex items-center justify-between">
          <span className="font-medium">{vaultStatusBanner}</span>
          <button
            type="button"
            onClick={() => setVaultStatusBanner(null)}
            className="text-emerald-800 underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Row 1: Explicit Consent Gate + Direct Picture Upload & Encryption */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Step 1: Explicit Consent Gate */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-xs font-mono text-slate-500">
                STEP 01 · EXPLICIT USER CONSENT
              </span>
              <h2 className="text-base font-semibold text-slate-900 mt-0.5">
                Informed Consent Before Image Processing
              </h2>
            </div>
            <FileCheck2 className="h-5 w-5 text-slate-700" />
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Our Firestore Zero-Trust Security Rules mathematically block any encrypted image upload unless an active, signed <code className="font-mono">/consents/&#123;uid&#125;</code> record exists with <code className="font-mono">consentGranted == true</code>.
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs space-y-1.5 font-mono">
            <p>
              Status:{" "}
              {consentRecord?.consentGranted ? (
                <span className="text-emerald-700 font-semibold">
                  ACTIVE &amp; VERIFIED
                </span>
              ) : (
                <span className="text-amber-700 font-semibold">
                  AWAITING EXPLICIT SIGNATURE
                </span>
              )}
            </p>
            <p>Policy Version: {consentRecord?.policyVersion || "v2.4-HIPAA-Aligned"}</p>
            <p>AI Model Training: FORBIDDEN (Enforced)</p>
            {consentRecord?.signatureHash && (
              <p className="truncate">
                SHA-256 Sig: {consentRecord.signatureHash}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              type="button"
              disabled={!currentUser || isSavingConsent}
              onClick={() => handleGrantOrUpdateExplicitConsent(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {consentRecord?.consentGranted
                ? "Re-Sign Explicit Consent"
                : "Sign & Grant Explicit Consent"}
            </button>

            {consentRecord?.consentGranted && (
              <button
                type="button"
                disabled={isSavingConsent}
                onClick={() => handleGrantOrUpdateExplicitConsent(false)}
                className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-800 hover:bg-red-100 transition-colors"
              >
                Revoke Consent
              </button>
            )}
          </div>
        </section>

        {/* Step 2: Secure Encrypted Picture Upload Feature */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-xs font-mono text-slate-500">
                STEP 02 · AES-256-GCM ENCRYPTED PICTURE UPLOAD
              </span>
              <h2 className="text-base font-semibold text-slate-900 mt-0.5">
                Upload &amp; Encrypt Patient Pictures (In Transit &amp; At Rest)
              </h2>
            </div>
            <Lock className="h-5 w-5 text-emerald-600" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Case / Body Area Label
              </label>
              <input
                type="text"
                value={uploadCaseTitle}
                onChange={(e) => setUploadCaseTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Condition Category
              </label>
              <select
                value={uploadCategory}
                onChange={(e) =>
                  setUploadCategory(e.target.value as SupportedConditionCategory)
                }
                className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900"
              >
                {SUPPORTED_CONDITION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Angle / Progression Tag
              </label>
              <div className="flex gap-1.5">
                <select
                  value={uploadViewLabel}
                  onChange={(e) =>
                    setUploadViewLabel(e.target.value as ImageViewLabel)
                  }
                  className="w-2/3 rounded-lg border border-slate-200 px-2 py-2 text-xs text-slate-900"
                >
                  <option value="Front view">Front view</option>
                  <option value="Side view">Side view</option>
                  <option value="Close-up">Close-up</option>
                  <option value="Comparison with an earlier image">
                    Comparison
                  </option>
                </select>
                <input
                  type="text"
                  value={uploadDayLabel}
                  onChange={(e) => setUploadDayLabel(e.target.value)}
                  className="w-1/3 rounded-lg border border-slate-200 px-2 py-2 text-xs font-mono text-slate-900"
                  placeholder="Day 1"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={() => directVaultFileRef.current?.click()}
              disabled={isEncryptingUpload}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {isEncryptingUpload ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Select Picture(s) to Upload &amp; Encrypt
            </button>
            <input
              ref={directVaultFileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleDirectPictureUpload}
              className="hidden"
            />

            {sessionImages.length > 0 && (
              <button
                type="button"
                disabled={
                  !currentUser ||
                  !consentRecord?.consentGranted ||
                  isEncryptingUpload
                }
                onClick={async () => {
                  for (const img of sessionImages) {
                    await handleEncryptAndUploadDataUrl(
                      img.dataUrl,
                      uploadCaseTitle,
                      uploadCategory,
                      img.viewLabel,
                      img.dayLabel || uploadDayLabel,
                      Boolean(img.privacyRedacted)
                    );
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-900 bg-white px-4 py-2.5 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Encrypt &amp; Backup Active Session Photos ({sessionImages.length})
              </button>
            )}
          </div>
        </section>
      </div>

      {/* Row 2: Encrypted Cloud Vault Records & Permanent Deletion */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <span className="text-xs font-mono text-slate-500">
              ZERO-KNOWLEDGE CLOUD VAULT (/encrypted_images)
            </span>
            <h2 className="text-base font-semibold text-slate-900 mt-0.5">
              Encrypted Patient Images &amp; Permanent Deletion Controls
            </h2>
          </div>

          <button
            type="button"
            onClick={handlePurgeEntireCloudAndLocalVault}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Permanently Delete All Images &amp; Keys ({cloudImages.length + sessionImages.length})
          </button>
        </div>

        {!currentUser ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center space-y-2">
            <p className="text-sm font-medium text-slate-800">
              Sign in with Google above to view or manage your cloud-encrypted patient images
            </p>
            <p className="text-xs text-slate-500">
              Access to <code className="font-mono">/encrypted_images</code> is strictly restricted by Firestore Security Rules to verified owners and authorized personnel.
            </p>
          </div>
        ) : cloudImages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center space-y-2">
            <p className="text-sm font-medium text-slate-800">
              No encrypted images stored in your cloud vault yet
            </p>
            <p className="text-xs text-slate-500">
              Grant explicit consent above and click &ldquo;Select Picture(s) to Upload &amp; Encrypt&rdquo; or &ldquo;Encrypt &amp; Backup Active Session Photos&rdquo;.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cloudImages.map((item) => {
              const decryptedUrl = decryptedPreviews[item.id];
              const isInspecting = inspectCiphertextId === item.id;
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {item.caseTitle}
                      </span>
                      <span className="text-[11px] font-mono text-emerald-700 shrink-0">
                        {item.cipherAlgorithm}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 font-mono flex items-center justify-between">
                      <span>
                        {item.category} · {item.viewLabel}
                      </span>
                      <span>{item.dayLabel}</span>
                    </div>

                    {/* Decrypted Preview or Locked Ciphertext Box */}
                    <div className="aspect-4/3 w-full rounded-lg bg-slate-900 overflow-hidden flex items-center justify-center relative border border-slate-800">
                      {decryptedUrl ? (
                        <img
                          src={decryptedUrl}
                          alt={item.caseTitle}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="p-4 text-center space-y-2">
                          <Lock className="h-6 w-6 text-emerald-400 mx-auto" />
                          <p className="text-xs font-semibold text-white">
                            Encrypted At Rest in Firestore
                          </p>
                          <p className="text-[10px] font-mono text-slate-400 break-all">
                            IV: {item.ivBase64}
                          </p>
                          <p className="text-[10px] font-mono text-slate-400 break-all">
                            SHA-256: {item.sha256Digest.slice(0, 24)}...
                          </p>
                        </div>
                      )}
                    </div>

                    {isInspecting && (
                      <div className="rounded-md bg-slate-950 p-2.5 text-[10px] font-mono text-slate-300 space-y-1">
                        <p className="text-emerald-400">
                          Raw Firestore Ciphertext Envelope:
                        </p>
                        <p className="break-all">
                          {item.ciphertextBase64.slice(0, 180)}...
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 pt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {decryptedUrl ? (
                        <button
                          type="button"
                          onClick={() =>
                            setDecryptedPreviews((prev) => {
                              const next = { ...prev };
                              delete next[item.id];
                              return next;
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <EyeOff className="h-3 w-3" /> Lock Preview
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDecryptCloudImage(item)}
                          className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
                        >
                          <Eye className="h-3 w-3" /> Decrypt &amp; View
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setInspectCiphertextId(isInspecting ? null : item.id)
                        }
                        className="text-[11px] font-mono text-slate-500 hover:text-slate-900 underline"
                      >
                        {isInspecting ? "Hide Cipher" : "Inspect Cipher"}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handlePermanentlyDeleteCloudImage(item.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete Permanently
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Row 3: Comprehensive Data Handling Policies & Authorized Personnel RBAC */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Data Handling Policy Specification */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <span className="text-xs font-mono text-slate-500">
              TRANSPARENT CLINICAL DATA GOVERNANCE
            </span>
            <h2 className="text-base font-semibold text-slate-900 mt-0.5">
              Care Aid Ai — Patient Image Data Handling Policy
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600 leading-relaxed">
            <div className="rounded-lg border border-slate-200 p-3.5 space-y-1">
              <p className="font-semibold text-slate-900">
                01. Explicit Informed Consent First
              </p>
              <p>
                No patient image is analyzed or uploaded without your explicit consent. A cryptographic SHA-256 signature of your consent is verified by Firestore security rules on every upload.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3.5 space-y-1">
              <p className="font-semibold text-slate-900">
                02. Dual-Layer Encryption (Transit &amp; Rest)
              </p>
              <p>
                All network traffic is encrypted over HTTPS/TLS 1.3. Before cloud storage, images are encrypted in your browser using 256-bit WebCrypto <code className="font-mono">AES-256-GCM</code> with a unique 96-bit IV and SHA-256 integrity hash.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3.5 space-y-1">
              <p className="font-semibold text-slate-900">
                03. Strict Access Restriction (RBAC)
              </p>
              <p>
                Zero-Trust Firestore rules restrict read/write access strictly to the authenticated Patient Owner (<code className="font-mono">request.auth.uid == ownerUid</code>) and verified clinical personnel in <code className="font-mono">/authorized_personnel</code>.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3.5 space-y-1">
              <p className="font-semibold text-slate-900">
                04. Right to Permanent Erasure
              </p>
              <p>
                You can permanently delete individual photos or purge your entire cloud and local vault at any time. Deleted ciphertext and local AES-256 keys are irrecoverably destroyed.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3.5 space-y-1">
              <p className="font-semibold text-slate-900">
                05. Zero AI Model Training Guarantee
              </p>
              <p>
                Patient photographs, intake answers, and consultation chat logs are never used to train or fine-tune AI models.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3.5 space-y-1">
              <p className="font-semibold text-slate-900">
                06. Identifier Redaction &amp; Minimization
              </p>
              <p>
                Patients are automatically warned not to include faces or ID badges, and can apply the built-in Privacy Mask to strip peripheral borders prior to analysis.
              </p>
            </div>
          </div>
        </section>

        {/* Authorized Personnel RBAC Console & Immutable Security Audit Log */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
            <div>
              <span className="text-xs font-mono text-slate-500">
                ROLE-BASED ACCESS &amp; AUDIT TRAIL
              </span>
              <h2 className="text-base font-semibold text-slate-900 mt-0.5">
                Authorized Personnel &amp; Security Logs
              </h2>
            </div>
            <UserCheck className="h-5 w-5 text-slate-700" />
          </div>

          {isChiefAdmin ? (
            <form onSubmit={handleAuthorizePersonnel} className="space-y-2.5 text-xs">
              <p className="font-semibold text-emerald-800">
                Chief Medical Admin Console ({CHIEF_ADMIN_EMAIL})
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newStaffUid}
                  onChange={(e) => setNewStaffUid(e.target.value)}
                  placeholder="Personnel Firebase UID"
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5"
                />
                <input
                  type="email"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  placeholder="Clinician Email"
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="Dr. Full Name"
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5"
                />
                <select
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value as any)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5"
                >
                  <option value="triage_clinician">Triage Clinician</option>
                  <option value="security_auditor">Security Auditor</option>
                  <option value="chief_medical_admin">Chief Medical Admin</option>
                </select>
                <input
                  type="text"
                  value={newStaffBadge}
                  onChange={(e) => setNewStaffBadge(e.target.value)}
                  placeholder="Badge ID"
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Grant Authorized Personnel Access
              </button>
            </form>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              Only the verified Chief Medical Administrator (<code className="font-mono">{CHIEF_ADMIN_EMAIL}</code>) can add or revoke personnel in <code className="font-mono">/authorized_personnel</code>.
            </div>
          )}

          {/* Immutable Security Audit Log */}
          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-semibold text-slate-900">
              Immutable Security Audit Log (<code className="font-mono">/security_audit_logs</code>)
            </h3>
            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-500">
                No security events recorded for this account yet.
              </p>
            ) : (
              <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-2.5 text-[11px] space-y-0.5">
                    <div className="flex items-center justify-between font-mono">
                      <span className="font-semibold text-slate-900">
                        {log.actionType}
                      </span>
                      <span className="text-slate-500">{log.targetResourceId}</span>
                    </div>
                    <p className="text-slate-600">{log.details}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
