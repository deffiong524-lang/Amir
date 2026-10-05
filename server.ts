import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: "image/jpeg", data: dataUrl };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support multi-image base64 payloads
  app.use(express.json({ limit: "35mb" }));

  // 1. Pre-flight Image Quality Check Endpoint
  app.post("/api/analyze-quality", async (req, res) => {
    try {
      const { imageDataUrl, expectedConditionCategory, viewLabel } = req.body;
      if (!imageDataUrl) {
        return res.status(400).json({ error: "imageDataUrl is required" });
      }

      const ai = getGenAI();
      const { mimeType, data } = parseDataUrl(imageDataUrl);

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data,
              },
            },
            {
              text: `Evaluate this patient-submitted photograph for a cautious first-aid image assessment.
View type tag: "${viewLabel || "Front view"}".
Selected condition category: "${expectedConditionCategory || "Visible skin/injury symptom"}".

Check whether the image has any of these reliability issues:
1. Too dark (poor illumination, deep shadows obscuring the area)
2. Blurry (out of focus or motion blur preventing clear surface observation)
3. Too far away (affected area occupies too little of the frame to see detail)
4. Obstructed (covered by clothing, bandages, fingers, hair, or glare)
5. Showing the wrong body area or non-medical/unrelated object
6. Too low resolution (pixelated or compressed beyond reliable visual inspection)
Also check if unnecessary personally identifying features (full face, ID badge, readable address/license) are visible so we can warn the patient.

If the image cannot be assessed reliably, set overallPass to false and provide polite, clear retakeGuidance asking the patient to take another photo rather than guessing.`,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallPass: {
                type: Type.BOOLEAN,
                description: "True if the photo is clear enough to support a cautious visual first-aid observation.",
              },
              qualityScore: {
                type: Type.INTEGER,
                description: "Clarity and lighting quality score from 0 to 100.",
              },
              isTooDark: { type: Type.BOOLEAN },
              isBlurry: { type: Type.BOOLEAN },
              isTooFarAway: { type: Type.BOOLEAN },
              isObstructed: { type: Type.BOOLEAN },
              isWrongBodyArea: { type: Type.BOOLEAN },
              isTooLowResolution: { type: Type.BOOLEAN },
              hasIdentifyingInfoWarning: {
                type: Type.BOOLEAN,
                description: "True if a face, name tag, or personal identifier is visible in the frame.",
              },
              detectedIssues: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Short human-readable labels for any detected quality issues.",
              },
              lightingSummary: {
                type: Type.STRING,
                description: "Brief note on lighting, focus, and framing quality.",
              },
              retakeGuidance: {
                type: Type.STRING,
                description: "Actionable guidance on how to retake the photo if quality is suboptimal or unreliable.",
              },
            },
            required: [
              "overallPass",
              "qualityScore",
              "isTooDark",
              "isBlurry",
              "isTooFarAway",
              "isObstructed",
              "isWrongBodyArea",
              "isTooLowResolution",
              "hasIdentifyingInfoWarning",
              "detectedIssues",
              "lightingSummary",
              "retakeGuidance",
            ],
          },
        },
      });

      const text = response.text || "{}";
      return res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Error in /api/analyze-quality:", error);
      return res.status(500).json({
        error: error?.message || "Failed to evaluate image quality.",
      });
    }
  });

  // 2. Combined 3-Source Multimodal First-Aid Assessment Endpoint
  app.post("/api/analyze-condition", async (req, res) => {
    try {
      const { images, intake } = req.body;
      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: "At least one patient image is required." });
      }

      const ai = getGenAI();

      const imageParts: any[] = [];
      images.forEach((img: { dataUrl: string; viewLabel: string; dayLabel?: string }, idx: number) => {
        const { mimeType, data } = parseDataUrl(img.dataUrl);
        imageParts.push({
          text: `Image #${idx + 1} — View: ${img.viewLabel || "Front view"}${img.dayLabel ? ` (${img.dayLabel})` : ""}:`,
        });
        imageParts.push({
          inlineData: {
            mimeType,
            data,
          },
        });
      });

      const promptText = `You are a cautious, clinical-grade First-Aid & Visual Triage AI Assistant.
You must combine THREE inputs to provide a safe, structured first-aid assessment:
1. Patient's Image(s) (${images.length} photo(s) provided)
2. Patient's Symptom Description & Category
3. Patient's Structured Intake Answers

PATIENT INTAKE DATA:
- Condition Category: ${intake?.category || "General visible injury/symptom"}
- Body Location: ${intake?.bodyLocation || "Not specified"}
- 1. What happened?: ${intake?.whatHappened || "Not specified"}
- 2. When did it happen?: ${intake?.whenHappened || "Not specified"}
- 3. Is the area painful?: ${intake?.painStatus || "Not specified"} (Pain level: ${intake?.painLevel ?? "N/A"}/10)
- 4. Is there bleeding?: ${intake?.bleedingStatus || "Not specified"}
- 5. Is the condition getting better or worse?: ${intake?.progressionStatus || "Not specified"}
- Additional Context / Medical Notes: ${intake?.additionalNotes || "None"}

CRITICAL SAFETY & CLINICAL RULES (MANDATORY):
1. NEVER claim that an image provides a confirmed medical diagnosis.
   - Instead of saying "You have an infection" or "This is a second-degree burn", ALWAYS use cautious observational phrasing such as: "The image shows redness and localized swelling that can sometimes occur with a minor skin infection or localized inflammation. Because a photograph cannot confirm the underlying cause, consider getting evaluated by a healthcare professional..."
2. Explicitly acknowledge limitations when image quality, lighting, camera angle, skin tone rendering, or 2D depth cues limit certainty.
3. If the image quality is too poor to assess reliably (e.g., completely blurry, pitch dark, or obstructed), set "unreliableImageQuality" to true and instruct the patient to retake the photo rather than guessing.
4. EMERGENCY DETECTION:
   - Check immediately for signs of a potentially serious medical emergency: severe/deep open wounds, significant uncontrolled bleeding, major or charred burns, obvious severe deformity/dislocation, possible exposed bone or deep tissue, severe rapid swelling after major trauma, or signs of a serious systemic/allergic reaction.
   - If detected, set "isEmergency" to true, set "urgencyLevel" to "high", and provide ONLY immediate life/limb-preserving first-aid steps while the patient seeks urgent emergency medical care.
5. MULTIPLE IMAGES COMPARISON:
   - If more than one image is provided (e.g., Front view, Side view, Close-up, or Comparison with an earlier image), describe the visible differences or complementary details across images without claiming that an image comparison alone proves clinical improvement or deterioration.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: {
          parts: [...imageParts, { text: promptText }],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              urgencyLevel: {
                type: Type.STRING,
                description: "Must be 'low' (Low concern / basic first aid), 'medium' (Needs medical evaluation), or 'high' (Potential emergency — seek immediate medical care).",
              },
              urgencyTitle: {
                type: Type.STRING,
                description: "Clear urgency headline matching the tier.",
              },
              urgencyRationale: {
                type: Type.STRING,
                description: "Why this urgency tier was selected by combining the visible features and the patient's intake answers.",
              },
              isEmergency: {
                type: Type.BOOLEAN,
                description: "True if the image or description suggests a potential medical emergency requiring immediate care.",
              },
              emergencyBannerMessage: {
                type: Type.STRING,
                description: "If isEmergency is true, provide a clear emergency alert message explaining why urgent care is needed.",
              },
              unreliableImageQuality: {
                type: Type.BOOLEAN,
                description: "True if the image is too blurry, dark, or obstructed to make even a cautious observation.",
              },
              cautiousObservationSummary: {
                type: Type.STRING,
                description: "2-3 sentence cautious visual observation strictly avoiding definitive diagnosis language.",
              },
              visibleCharacteristics: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    feature: { type: Type.STRING },
                    observation: { type: Type.STRING },
                    imageReference: { type: Type.STRING },
                  },
                  required: ["feature", "observation", "imageReference"],
                },
              },
              multiImageComparison: {
                type: Type.STRING,
                description: "Synthesis comparing multiple angles or earlier vs current photos, noting visible changes cautiously.",
              },
              firstAidSteps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    stepNumber: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    instruction: { type: Type.STRING },
                    cautionNote: { type: Type.STRING },
                  },
                  required: ["stepNumber", "title", "instruction", "cautionNote"],
                },
              },
              warningSignsForEscalation: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Specific red-flag symptoms (e.g. spreading redness, fever, pus, increasing severe pain, numbness) that require prompt medical evaluation.",
              },
              visualLimitationsNote: {
                type: Type.STRING,
                description: "Explicit statement on lighting, angle, temperature, depth, or photographic limitations for this specific case.",
              },
              questionsForClinician: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "3 practical questions the patient can ask a healthcare professional if they seek evaluation.",
              },
            },
            required: [
              "urgencyLevel",
              "urgencyTitle",
              "urgencyRationale",
              "isEmergency",
              "emergencyBannerMessage",
              "unreliableImageQuality",
              "cautiousObservationSummary",
              "visibleCharacteristics",
              "multiImageComparison",
              "firstAidSteps",
              "warningSignsForEscalation",
              "visualLimitationsNote",
              "questionsForClinician",
            ],
          },
        },
      });

      const text = response.text || "{}";
      return res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Error in /api/analyze-condition:", error);
      return res.status(500).json({
        error: error?.message || "Failed to analyze patient image and intake.",
      });
    }
  });

  // 3. Progress Tracking Timeline Comparison Endpoint (e.g., Day 1 -> Day 3 -> Day 7)
  app.post("/api/compare-timeline", async (req, res) => {
    try {
      const { entries, caseTitle } = req.body;
      if (!entries || !Array.isArray(entries) || entries.length < 2) {
        return res.status(400).json({ error: "At least two timeline entries are required for comparison." });
      }

      const ai = getGenAI();
      const parts: any[] = [];

      entries.forEach((entry: any, index: number) => {
        const { mimeType, data } = parseDataUrl(entry.imageDataUrl);
        parts.push({
          text: `Timeline Entry #${index + 1} (${entry.dayLabel} — Recorded ${entry.dateLabel}):
Patient Note: "${entry.notes || "No note"}" | Pain Level: ${entry.painLevel}/10 | Reported Trend: ${entry.progressionStatus}`,
        });
        parts.push({
          inlineData: { mimeType, data },
        });
      });

      parts.push({
        text: `Compare these chronological patient timeline images (${entries.map((e: any) => e.dayLabel).join(" → ")}) for "${caseTitle || "Tracked Condition"}".
RULES:
1. Describe visible changes between the images (such as changes in redness border, swelling contour, scab/surface closure, or discoloration).
2. NEVER claim that an image comparison proves clinical improvement or deterioration without appropriate clinical context and physical examination.
3. Account for possible lighting or camera angle differences between days.
4. Remind the patient when professional evaluation is appropriate.`,
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              timelineProgressionHeadline: { type: Type.STRING },
              visibleChangesSummary: { type: Type.STRING },
              dayByDayTransitions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    intervalLabel: { type: Type.STRING, description: "e.g. Day 1 → Day 3" },
                    observedVisualShift: { type: Type.STRING },
                    symptomCorrelation: { type: Type.STRING },
                  },
                  required: ["intervalLabel", "observedVisualShift", "symptomCorrelation"],
                },
              },
              lightingAndAngleCaveat: { type: Type.STRING },
              whenToSeekEvaluation: { type: Type.STRING },
            },
            required: [
              "timelineProgressionHeadline",
              "visibleChangesSummary",
              "dayByDayTransitions",
              "lightingAndAngleCaveat",
              "whenToSeekEvaluation",
            ],
          },
        },
      });

      const text = response.text || "{}";
      return res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Error in /api/compare-timeline:", error);
      return res.status(500).json({
        error: error?.message || "Failed to compare timeline progression.",
      });
    }
  });

  // 4. Generate Audio Narration (TTS) for Selected Contents
  app.post("/api/generate-speech", async (req, res) => {
    try {
      const { selectedText, voiceName = "Kore", toneStyle = "Calm, reassuring, clear clinical educator" } = req.body;
      if (!selectedText || typeof selectedText !== "string") {
        return res.status(400).json({ error: "selectedText is required." });
      }

      const ai = getGenAI();
      const trimmedText = selectedText.slice(0, 1800);

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: trimmedText,
                speechMetadata: {
                  style: toneStyle,
                },
              } as any,
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"].includes(voiceName)
                  ? voiceName
                  : "Kore",
              },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        return res.status(500).json({ error: "No audio data returned by TTS model." });
      }

      return res.json({
        audioDataUrl: `data:audio/wav;base64,${base64Audio}`,
        mimeType: "audio/wav",
      });
    } catch (error: any) {
      console.error("Error in /api/generate-speech:", error);
      return res.status(500).json({
        error: error?.message || "Failed to synthesize speech for selected content.",
      });
    }
  });

  // 5. Generate Video & Audio Guide Storyboard from Selected Content
  app.post("/api/generate-media-storyboard", async (req, res) => {
    try {
      const { selectedTitle, selectedContent, urgencyLevel } = req.body;
      if (!selectedContent) {
        return res.status(400).json({ error: "selectedContent is required." });
      }

      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `Transform the following selected patient first-aid / assessment content into a concise 4-scene instructional video & audio walkthrough storyboard so the patient can watch and listen to clear care instructions.

Selected Section Title: "${selectedTitle || "First-Aid Care Walkthrough"}"
Urgency Context: "${urgencyLevel || "low"}"
Selected Content:
"""
${selectedContent}
"""

Remember: Never state a confirmed diagnosis. Keep instructions calm, clear, and safety-first.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              videoTitle: { type: Type.STRING },
              fullNarrationScript: {
                type: Type.STRING,
                description: "Complete spoken script (approx 45-75 words) reading smoothly across all scenes.",
              },
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sceneNumber: { type: Type.INTEGER },
                    heading: { type: Type.STRING },
                    keyBullet: { type: Type.STRING },
                    cautionCallout: { type: Type.STRING },
                    durationSeconds: { type: Type.INTEGER },
                    visualIconType: {
                      type: Type.STRING,
                      description: "One of: 'cleanse', 'protect', 'monitor', 'escalate', 'timeline'",
                    },
                  },
                  required: [
                    "sceneNumber",
                    "heading",
                    "keyBullet",
                    "cautionCallout",
                    "durationSeconds",
                    "visualIconType",
                  ],
                },
              },
            },
            required: ["videoTitle", "fullNarrationScript", "scenes"],
          },
        },
      });

      const text = response.text || "{}";
      return res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Error in /api/generate-media-storyboard:", error);
      return res.status(500).json({
        error: error?.message || "Failed to create media storyboard from selected content.",
      });
    }
  });

  // 6. Post-Diagnosis AI Consultation Chat & Location-Based Hospital Referral Endpoint
  app.post("/api/chat-consultation", async (req, res) => {
    try {
      const {
        userMessage,
        chatHistory = [],
        intake,
        assessment,
        userLocation,
        nearbyHospitals = [],
      } = req.body;

      if (!userMessage || typeof userMessage !== "string") {
        return res.status(400).json({ error: "userMessage is required." });
      }

      const ai = getGenAI();

      const hospitalContextLines =
        Array.isArray(nearbyHospitals) && nearbyHospitals.length > 0
          ? nearbyHospitals
              .slice(0, 5)
              .map(
                (h: any, idx: number) =>
                  `${idx + 1}. ${h.displayName} — ${h.formattedAddress || "Address available on map"}${
                    typeof h.distanceKm === "number" ? ` (${h.distanceKm.toFixed(1)} km away)` : ""
                  }${h.nationalPhoneNumber ? ` · Phone: ${h.nationalPhoneNumber}` : ""}${
                    h.googleMapsURI ? ` · Maps Link: ${h.googleMapsURI}` : ""
                  }`
              )
              .join("\n")
          : "Use Google Maps grounding to identify the closest appropriate hospitals or emergency departments.";

      const historyTranscript = Array.isArray(chatHistory)
        ? chatHistory
            .slice(-8)
            .map((m: any) => `${m.role === "user" ? "Patient" : "Clarion AI"}: ${m.content}`)
            .join("\n\n")
        : "";

      const isSeriousOrReferralQuery =
        assessment?.isEmergency ||
        assessment?.urgencyLevel === "high" ||
        assessment?.urgencyLevel === "medium" ||
        /hospital|emergency|urgent|clinic|near|where|doctor|refer|location|directions|treatment/i.test(
          userMessage
        );

      const prompt = `You are Clarion Triage's Post-Assessment Clinical Consultation & Hospital Referral Assistant.
You are speaking with a patient in the interactive consultation chat room right after their visual first-aid assessment.

PATIENT INTAKE & ASSESSMENT CONTEXT:
- Condition Category: ${intake?.category || "Visible condition"} (${intake?.bodyLocation || "Unspecified area"})
- What Happened: ${intake?.whatHappened || "Not specified"} (${intake?.whenHappened || "Recent"})
- Pain & Bleeding: ${intake?.painStatus || "N/A"} (${intake?.painLevel ?? 0}/10), ${intake?.bleedingStatus || "N/A"}
- Trend: ${intake?.progressionStatus || "N/A"}
- Assessment Urgency Tier: ${assessment?.urgencyLevel?.toUpperCase() || "LOW"} — ${assessment?.urgencyTitle || "First-Aid Assessment"}
- Emergency Flag: ${assessment?.isEmergency ? "YES (POTENTIAL MEDICAL EMERGENCY)" : "No"}
- Cautious Visual Summary: ${assessment?.cautiousObservationSummary || "No prior summary"}
- Recommended First-Aid Steps: ${
        assessment?.firstAidSteps?.map((s: any) => `${s.stepNumber}. ${s.title}: ${s.instruction}`).join(" | ") ||
        "Standard first aid"
      }
- Escalation Warning Signs: ${assessment?.warningSignsForEscalation?.join(", ") || "Spreading redness, severe pain, fever"}

PATIENT LOCATION & NEARBY HOSPITALS:
- Patient Coordinates / Area: ${
        userLocation
          ? `${userLocation.label || "Patient Location"} (Lat: ${userLocation.lat}, Lng: ${userLocation.lng})`
          : "Location not yet shared"
      }
- Verified Nearby Hospitals / Urgent Care Facilities:
${hospitalContextLines}

RECENT CHAT TRANSCRIPT:
${historyTranscript || "(Start of consultation)"}

PATIENT'S NEW QUESTION:
"${userMessage}"

INSTRUCTIONS:
1. Answer the patient's question directly, empathetically, and clearly based on their assessment and symptoms.
2. NEVER claim a confirmed diagnosis from the photo; maintain cautious observational phrasing.
3. HOSPITAL REFERRAL RULE: If the patient has a serious or urgent condition (Urgency HIGH or MEDIUM, or Emergency Flag = YES) OR if the patient asks where to get treated, proactively refer them to the nearest appropriate hospital(s) or emergency department based on their location, mentioning the facility name, approximate distance/address, what to tell the triage nurse on arrival, and immediate first-aid precautions while traveling.`;

      const config: any = {};

      // Enable Google Maps grounding when location is provided or when hospital/referral info is needed
      if (userLocation && typeof userLocation.lat === "number" && typeof userLocation.lng === "number") {
        config.tools = [{ googleMaps: {} }];
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: userLocation.lat,
              longitude: userLocation.lng,
            },
          },
        };
      } else if (isSeriousOrReferralQuery) {
        config.tools = [{ googleMaps: {} }];
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config,
      });

      const replyText =
        response.text ||
        "I recommend having a healthcare professional evaluate the area directly, especially if symptoms worsen.";

      // Extract Google Maps grounding chunks per Gemini API Maps Grounding rules
      const mapLinks: { title: string; uri: string; reviewSnippets?: string[] }[] = [];
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (Array.isArray(chunks)) {
        for (const chunk of chunks as any[]) {
          if (chunk?.maps?.uri) {
            const snippets: string[] = [];
            const sources = chunk.maps.placeAnswerSources?.reviewSnippets;
            if (Array.isArray(sources)) {
              for (const s of sources) {
                if (s?.reviewText || s?.text) {
                  snippets.push(s.reviewText || s.text);
                }
              }
            }
            mapLinks.push({
              title: chunk.maps.title || "View Hospital on Google Maps",
              uri: chunk.maps.uri,
              reviewSnippets: snippets.length > 0 ? snippets : undefined,
            });
          }
        }
      }

      return res.json({
        reply: replyText,
        mapLinks,
      });
    } catch (error: any) {
      console.error("Error in /api/chat-consultation:", error);
      return res.status(500).json({
        error: error?.message || "Failed to generate consultation response.",
      });
    }
  });

  // 6. Post-Assessment In-App Chat Room (with optional picture upload in chat)
  app.post("/api/chat-followup", async (req, res) => {
    try {
      const { messages, intake, assessment, attachedImageDataUrl } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Chat messages are required." });
      }

      const ai = getGenAI();
      const parts: any[] = [];

      if (attachedImageDataUrl) {
        const { mimeType, data } = parseDataUrl(attachedImageDataUrl);
        parts.push({
          text: "Patient attached a new follow-up picture in the chat room:",
        });
        parts.push({
          inlineData: { mimeType, data },
        });
      }

      const transcript = messages
        .map((m: { role: string; text: string }) => `${m.role === "user" ? "Patient" : "Care Aid Ai"}: ${m.text}`)
        .join("\n\n");

      parts.push({
        text: `You are Care Aid Ai, a cautious, empathetic clinical first-aid & patient triage assistant in an interactive follow-up chat room.

CURRENT PATIENT CASE CONTEXT:
- Condition Category: ${intake?.category || "Visible symptom"}
- Body Location: ${intake?.bodyLocation || "Not specified"}
- What Happened: ${intake?.whatHappened || "Not specified"}
- Pain Level: ${intake?.painLevel ?? "N/A"}/10 (${intake?.painStatus || ""})
- Bleeding Status: ${intake?.bleedingStatus || "Not specified"}
- Current Urgency Level: ${assessment?.urgencyLevel || "Not yet assessed"} (${assessment?.urgencyTitle || ""})
- Observation Summary: ${assessment?.cautiousObservationSummary || "No initial assessment yet."}

CONVERSATION HISTORY:
${transcript}

SAFETY RULES:
1. Answer the patient's latest question clearly, compassionately, and practically.
2. NEVER claim a confirmed medical diagnosis from an image or chat description.
3. If the patient describes severe or worsening symptoms (e.g. spreading redness, high fever, uncontrolled bleeding, difficulty breathing, severe pain, exposed bone/deep tissue), immediately advise urgent emergency medical care and suggest using the Nearest Hospital Referral feature right in the room.`,
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: "Clear, helpful, safety-first response to the patient's question.",
              },
              recommendHospitalReferral: {
                type: Type.BOOLEAN,
                description: "True if the patient's question or symptoms warrant immediate hospital or urgent care referral.",
              },
              suggestedFollowUpQuestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "2-3 helpful follow-up questions the patient can click to ask next.",
              },
            },
            required: ["reply", "recommendHospitalReferral", "suggestedFollowUpQuestions"],
          },
        },
      });

      const text = response.text || "{}";
      return res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Error in /api/chat-followup:", error);
      return res.status(500).json({
        error: error?.message || "Failed to generate chat response.",
      });
    }
  });

  // 7. Nearest Hospital & Emergency Care Referral based on Patient Location (Google Maps Grounding)
  app.post("/api/refer-nearest-hospitals", async (req, res) => {
    try {
      const { latitude, longitude, locationQuery, conditionCategory, urgencyLevel, symptomSummary } =
        req.body;

      const ai = getGenAI();

      const hasCoords =
        typeof latitude === "number" &&
        typeof longitude === "number" &&
        !Number.isNaN(latitude) &&
        !Number.isNaN(longitude);

      const locationDescription = hasCoords
        ? `near coordinates (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`
        : locationQuery
        ? `in or near ${locationQuery}`
        : "nearby emergency hospitals and urgent care centers";

      const careType =
        urgencyLevel === "high"
          ? "Emergency Department / Trauma & Acute Care Hospital"
          : "Hospital Emergency Room or Urgent Care Medical Center";

      const prompt = `A patient requires a medical facility referral for "${
        conditionCategory || "an acute injury/condition"
      }" (${symptomSummary || "requires clinical evaluation"}).
Urgency Tier: ${urgencyLevel || "medium"} — Recommended Facility Type: ${careType}.

Find the nearest, well-equipped hospitals, emergency departments, or urgent care clinics ${locationDescription} where the patient can receive prompt evaluation and treatment.
For each facility, explain:
1. Facility Name & Type (Emergency Department, Level 1/2 Trauma Center, or Urgent Care)
2. Why it is appropriate for "${conditionCategory || "this condition"}"
3. Practical arrival tips (e.g., bringing medication list, calling emergency services if unstable).`;

      const config: any = {
        tools: [{ googleMaps: {} }],
      };

      if (hasCoords) {
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude,
              longitude,
            },
          },
        };
      }

      // IMPORTANT: Do NOT set responseMimeType or responseSchema when googleMaps tool is enabled.
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config,
      });

      const markdownGuidance = response.text || "";
      const groundingChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

      const places: {
        title: string;
        uri: string;
        reviewSnippets: string[];
      }[] = [];

      for (const chunk of groundingChunks as any[]) {
        if (chunk?.maps?.uri) {
          const snippets: string[] = [];
          const reviewSources = chunk.maps?.placeAnswerSources?.reviewSnippets;
          if (Array.isArray(reviewSources)) {
            for (const s of reviewSources) {
              if (s?.content) snippets.push(s.content);
              else if (typeof s === "string") snippets.push(s);
            }
          }
          places.push({
            title: chunk.maps.title || "Hospital / Medical Center on Google Maps",
            uri: chunk.maps.uri,
            reviewSnippets: snippets,
          });
        }
      }

      return res.json({
        markdownGuidance,
        places,
        searchedLocation: locationDescription,
      });
    } catch (error: any) {
      console.error("Error in /api/refer-nearest-hospitals:", error);
      return res.status(500).json({
        error: error?.message || "Failed to look up nearest hospitals.",
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Clarion Triage server running on http://localhost:${PORT}`);
  });
}

startServer();
