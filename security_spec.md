# Care Aid Ai — Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Default-Deny Catch-All**: Any path not explicitly matched is unconditionally denied (`allow read, write: if false;`).
2. **Verified Authentication Invariant**: All write and read operations require an authenticated, email-verified user (`request.auth != null && request.auth.token.email_verified == true`).
3. **Explicit Consent Prerequisite Invariant**: An `EncryptedPatientImage` document in `/encrypted_images/{imageId}` CANNOT be created unless the referenced `/consents/$(incoming().consentId)` document exists, belongs to `request.auth.uid`, and has `consentGranted == true` and `allowProcessing == true`.
4. **Encryption-Only Storage Invariant**: Every `/encrypted_images/{imageId}` document must use `cipherAlgorithm == 'AES-256-GCM'`, provide a valid `ivBase64` (8–64 chars), `ciphertextBase64` (16–750,000 chars), and `sha256Digest` (16–128 chars). Plaintext image URLs without AES-GCM parameters are rejected.
5. **Strict RBAC Isolation Invariant**:
   - Patients can only `get`, `list`, `create`, `update`, or `delete` their own `/encrypted_images/{imageId}` where `ownerUid == request.auth.uid`.
   - Authorized Personnel (bootstrapped Chief Medical Admin `deffiong524@gmail.com` or verified personnel present in `/authorized_personnel/$(request.auth.uid)`) can inspect escalated records (`status == 'flagged_for_review'`) or audit logs, while patients retain exclusive permanent deletion rights over their own images.
6. **Immutable Audit Trail Invariant**: Documents in `/security_audit_logs/{logId}` can only be created (`allow update, delete: if false;`) with `createdAt == request.time` and `actorUid == request.auth.uid`.

---

## 2. The "Dirty Dozen" Payloads

1. **Identity Spoofing on Image Upload**: Attempting to create `/encrypted_images/img_1` with `ownerUid: "victim_uid"` while authenticated as `"attacker_uid"`.
2. **Unconsented Image Upload (Missing Consent Document)**: Attempting to create `/encrypted_images/img_2` referencing a non-existent `consentId: "fake_consent_999"`.
3. **Revoked Consent Bypass**: Attempting to create `/encrypted_images/img_3` referencing a consent document where `consentGranted == false`.
4. **Shadow Field Injection on Update**: Attempting to update `/encrypted_images/img_1` with an extra unauthorized key `isAdminApproved: true`.
5. **Plaintext / Weak Cipher Downgrade**: Attempting to create `/encrypted_images/img_4` with `cipherAlgorithm: "PLAINTEXT"` instead of `"AES-256-GCM"`.
6. **Denial-of-Wallet Oversized Payload**: Attempting to inject a `caseTitle` of 10,000 characters or an invalid `imageId` containing spaces/slashes.
7. **Timestamp Forgery (Temporal Integrity Breach)**: Attempting to create a consent or image document with a backdated `createdAt` instead of `request.time`.
8. **Immutable Ownership Transfer**: Attempting to update `ownerUid` or `createdAt` on an existing `/encrypted_images/{imageId}` document.
9. **Self-Assigned Clinical Privilege Escalation**: A non-admin user attempting to write their own UID into `/authorized_personnel/{uid}` with `role: "chief_medical_admin"`.
10. **Email Spoofing Attack**: Authenticating with `email: "deffiong524@gmail.com"` where `email_verified: false`.
11. **Blanket Query Scraping on Encrypted Images**: Executing an unscoped `list` query on `/encrypted_images` without filtering by `ownerUid == request.auth.uid`.
12. **Audit Log Tampering / Deletion**: Attempting to `update` or `delete` an existing `/security_audit_logs/{logId}` entry to cover up access or deletion events.
