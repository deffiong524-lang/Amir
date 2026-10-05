import React, { useEffect, useRef, useState } from "react";
import {
  Send,
  MapPin,
  AlertTriangle,
  ExternalLink,
  Upload,
  X,
  RefreshCw,
  Volume2,
  Navigation,
  MessageSquare,
  Building2,
} from "lucide-react";
import { PatientIntakeAnswers, TriageAssessmentResult } from "../types/triage";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  attachedImage?: string;
  recommendHospitalReferral?: boolean;
}

interface GroundedHospitalPlace {
  title: string;
  uri: string;
  reviewSnippets: string[];
}

interface ChatAndHospitalReferralRoomProps {
  intake: PatientIntakeAnswers;
  assessment: TriageAssessmentResult | null;
  onSendToMediaStudio: (title: string, content: string) => void;
  onAlsoAddUploadedPictureToTriage?: (dataUrl: string) => void;
}

export const ChatAndHospitalReferralRoom: React.FC<
  ChatAndHospitalReferralRoomProps
> = ({
  intake,
  assessment,
  onSendToMediaStudio,
  onAlsoAddUploadedPictureToTriage,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-msg",
      role: "assistant",
      text: "Welcome to the Care Aid Ai Follow-Up Consultation Room. You can ask questions about your image assessment, first-aid steps, dressing care, or warning signs—and you can also upload an additional picture directly in this chat. If your condition is serious or worsening, use the Nearest Hospital Referral panel to locate urgent medical care near you immediately.",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  ]);

  const [inputMessage, setInputMessage] = useState<string>("");
  const [attachedChatImage, setAttachedChatImage] = useState<string | null>(null);
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([
    "How often should I clean and change the dressing?",
    "What early signs mean this is getting infected?",
    "Can I shower or get the affected area wet?",
  ]);

  // Hospital Referral State
  const [locationQuery, setLocationQuery] = useState<string>("");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(
    null
  );
  const [locationStatus, setLocationStatus] = useState<string>("");
  const [isLocatingHospitals, setIsLocatingHospitals] = useState<boolean>(false);
  const [hospitalGuidance, setHospitalGuidance] = useState<string>("");
  const [hospitalPlaces, setHospitalPlaces] = useState<GroundedHospitalPlace[]>([]);
  const [hospitalError, setHospitalError] = useState<string | null>(null);

  const chatFileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync assessment context into the chat room when a new assessment completes
  useEffect(() => {
    if (!assessment) return;
    const summaryMsg: ChatMessage = {
      id: `assess-chat-${Date.now()}`,
      role: "assistant",
      text: `Assessment Summary (${assessment.urgencyTitle}): ${assessment.cautiousObservationSummary} Feel free to ask any questions below about your care steps or symptoms.`,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      recommendHospitalReferral:
        assessment.isEmergency || assessment.urgencyLevel !== "low",
    };
    setMessages((prev) => [...prev, summaryMsg]);

    if (assessment.questionsForClinician?.length) {
      setSuggestedQuestions(assessment.questionsForClinician);
    }
  }, [assessment]);

  const handleChatPictureSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAttachedChatImage(reader.result);
        if (onAlsoAddUploadedPictureToTriage) {
          onAlsoAddUploadedPictureToTriage(reader.result);
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSendMessage = async (textOverride?: string) => {
    const textToSend = (textOverride ?? inputMessage).trim();
    if (!textToSend && !attachedChatImage) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: textToSend || "Uploaded a follow-up picture for review.",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      attachedImage: attachedChatImage || undefined,
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInputMessage("");
    const currentImage = attachedChatImage;
    setAttachedChatImage(null);
    setIsSendingChat(true);

    try {
      const res = await fetch("/api/chat-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({ role: m.role, text: m.text })),
          intake,
          assessment,
          attachedImageDataUrl: currentImage,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to get response from Care Aid Ai");
      }

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        text: data.reply,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        recommendHospitalReferral: data.recommendHospitalReferral,
      };
      setMessages((prev) => [...prev, aiMsg]);
      if (
        Array.isArray(data.suggestedFollowUpQuestions) &&
        data.suggestedFollowUpQuestions.length > 0
      ) {
        setSuggestedQuestions(data.suggestedFollowUpQuestions);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          text:
            err?.message ||
            "Unable to reach Care Aid Ai right now. If you are experiencing severe symptoms, please contact emergency medical services immediately.",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleUseMyGpsAndFindHospitals = () => {
    setHospitalError(null);
    if (!navigator.geolocation) {
      setLocationStatus("Browser geolocation unavailable — please enter your city or postal code.");
      return;
    }
    setLocationStatus("Detecting your GPS coordinates...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextCoords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setCoords(nextCoords);
        setLocationStatus(
          `GPS locked (${nextCoords.latitude.toFixed(4)}, ${nextCoords.longitude.toFixed(4)})`
        );
        fetchNearestHospitals(nextCoords.latitude, nextCoords.longitude, locationQuery);
      },
      () => {
        setLocationStatus(
          "GPS permission declined or unavailable — searching by entered city/area instead."
        );
        fetchNearestHospitals(
          undefined,
          undefined,
          locationQuery || "San Francisco, CA"
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const fetchNearestHospitals = async (
    lat?: number,
    lng?: number,
    queryStr?: string
  ) => {
    setIsLocatingHospitals(true);
    setHospitalError(null);
    try {
      const res = await fetch("/api/refer-nearest-hospitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: lat ?? coords?.latitude,
          longitude: lng ?? coords?.longitude,
          locationQuery: queryStr ?? locationQuery,
          conditionCategory: intake.category,
          urgencyLevel: assessment?.urgencyLevel || "medium",
          symptomSummary: `${intake.whatHappened} (${intake.painStatus}, ${intake.bleedingStatus})`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to locate nearby hospitals.");
      }
      setHospitalGuidance(data.markdownGuidance || "");
      setHospitalPlaces(data.places || []);
    } catch (err: any) {
      setHospitalError(err?.message || "Could not look up nearby hospitals.");
    } finally {
      setIsLocatingHospitals(false);
    }
  };

  const isSeriousOrEmergency =
    assessment?.isEmergency ||
    assessment?.urgencyLevel === "high" ||
    assessment?.urgencyLevel === "medium" ||
    messages.some((m) => m.recommendHospitalReferral);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* LEFT COLUMN (7 cols): In-App Patient Consultation Chat Room */}
      <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-mono text-slate-500">
              POST-ASSESSMENT CLINICAL Q&amp;A ROOM
            </span>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mt-0.5">
              <MessageSquare className="h-4 w-4 text-slate-700" />
              Ask Care Aid Ai About Your Assessment
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Case: <strong className="text-slate-800">{intake.category}</strong> ({intake.bodyLocation})
          </span>
        </div>

        {/* Messages Scroll Area */}
        <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto bg-slate-50/50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[88%] rounded-xl p-4 text-xs leading-relaxed space-y-2.5 ${
                  msg.role === "user"
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-800"
                }`}
              >
                <div className="flex items-center justify-between gap-4 text-[11px] opacity-75 font-mono tabular-nums">
                  <span>{msg.role === "user" ? "You (Patient)" : "Care Aid Ai"}</span>
                  <span>{msg.timestamp}</span>
                </div>

                {msg.attachedImage && (
                  <div className="overflow-hidden rounded-lg border border-white/20 max-w-xs">
                    <img
                      src={msg.attachedImage}
                      alt="Patient uploaded in chat"
                      referrerPolicy="no-referrer"
                      className="w-full h-36 object-cover"
                    />
                  </div>
                )}

                <p className="whitespace-pre-line">{msg.text}</p>

                {msg.role === "assistant" && (
                  <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() =>
                        onSendToMediaStudio("Care Aid Ai Chat Guidance", msg.text)
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900 underline"
                    >
                      <Volume2 className="h-3 w-3" /> Convert Reply to Audio / Video
                    </button>

                    {msg.recommendHospitalReferral && (
                      <button
                        type="button"
                        onClick={handleUseMyGpsAndFindHospitals}
                        className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700"
                      >
                        <MapPin className="h-3 w-3" /> Find Nearest Hospital Now
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isSendingChat && (
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Care Aid Ai is reviewing your question and case context...
            </div>
          )}
        </div>

        {/* Suggested Follow-Up Questions */}
        <div className="border-t border-slate-200 bg-white px-6 py-3">
          <span className="block text-[11px] font-medium text-slate-500 mb-2">
            Suggested Questions (Click to ask):
          </span>
          <div className="flex flex-wrap gap-1.5">
            {suggestedQuestions.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(q)}
                disabled={isSendingChat}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors text-left"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Attached Chat Picture Preview */}
        {attachedChatImage && (
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={attachedChatImage}
                alt="Chat attachment preview"
                referrerPolicy="no-referrer"
                className="h-12 w-16 rounded object-cover border border-slate-300"
              />
              <span className="text-xs font-medium text-slate-700">
                Picture attached for Care Aid Ai follow-up analysis
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAttachedChatImage(null)}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Chat Input Bar with Picture Upload Button */}
        <div className="border-t border-slate-200 bg-white p-4 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => chatFileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
            title="Upload a picture into the chat"
          >
            <Upload className="h-4 w-4" />
            Upload Picture
          </button>
          <input
            ref={chatFileInputRef}
            type="file"
            accept="image/*"
            onChange={handleChatPictureSelect}
            className="hidden"
          />

          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask Care Aid Ai a question about your condition, first-aid steps, or recovery..."
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
          />

          <button
            type="button"
            onClick={() => handleSendMessage()}
            disabled={isSendingChat || (!inputMessage.trim() && !attachedChatImage)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </button>
        </div>
      </section>

      {/* RIGHT COLUMN (5 cols): Nearest Hospital & Emergency Care Referral (Google Maps Grounded) */}
      <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="border-b border-slate-200 pb-4">
          <span className="text-xs font-mono text-slate-500">
            LOCATION-BASED HOSPITAL &amp; URGENT CARE REFERRAL
          </span>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mt-0.5">
            <Building2 className="h-4 w-4 text-red-600" />
            Nearest Hospital &amp; Emergency Care Finder
          </h2>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            In serious or urgent situations, Care Aid Ai locates the nearest hospitals, trauma centers, and urgent care clinics equipped to treat <strong>{intake.category}</strong> based on your live location.
          </p>
        </div>

        {isSeriousOrEmergency && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3.5 text-xs text-red-950 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                Priority Medical Evaluation Recommended
              </p>
              <p className="mt-0.5 text-red-900">
                Based on your symptoms or assessment tier, prompt in-person evaluation at a nearby emergency department or urgent care clinic is advised.
              </p>
            </div>
          </div>
        )}

        {/* GPS & City Input Controls */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleUseMyGpsAndFindHospitals}
            disabled={isLocatingHospitals}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {isLocatingHospitals ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Locating Nearest Hospitals via Google Maps...
              </>
            ) : (
              <>
                <Navigation className="h-4 w-4" />
                Use My Current GPS Location to Find Nearest Hospitals
              </>
            )}
          </button>

          {locationStatus && (
            <p className="text-[11px] font-mono text-slate-500">{locationStatus}</p>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              placeholder="Or enter city, neighborhood, or postal code (e.g. London, Austin TX)..."
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
            />
            <button
              type="button"
              onClick={() =>
                fetchNearestHospitals(undefined, undefined, locationQuery)
              }
              disabled={isLocatingHospitals || !locationQuery.trim()}
              className="rounded-lg border border-slate-900 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              Search Area
            </button>
          </div>
        </div>

        {hospitalError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {hospitalError}
          </div>
        )}

        {/* Google Maps Grounded Place Links */}
        {hospitalPlaces.length > 0 && (
          <div className="space-y-2.5 border-t border-slate-200 pt-4">
            <h3 className="text-xs font-semibold text-slate-900">
              Verified Nearby Hospitals &amp; Clinics (Google Maps)
            </h3>
            <div className="space-y-2">
              {hospitalPlaces.map((place, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={place.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-slate-900 hover:text-red-700 underline flex items-center gap-1.5"
                    >
                      <MapPin className="h-3.5 w-3.5 text-red-600 shrink-0" />
                      {place.title}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    <span className="text-[11px] font-mono text-slate-500">
                      Directions
                    </span>
                  </div>
                  {place.reviewSnippets?.length > 0 && (
                    <p className="text-[11px] text-slate-600 italic">
                      &ldquo;{place.reviewSnippets[0]}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detailed Referral Guidance */}
        {hospitalGuidance && (
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900">
                Clinical Referral &amp; Arrival Instructions
              </h3>
              <button
                type="button"
                onClick={() =>
                  onSendToMediaStudio(
                    "Nearest Hospital Referral Instructions",
                    hospitalGuidance
                  )
                }
                className="text-[11px] text-slate-500 hover:text-slate-900 underline"
              >
                Audio Briefing
              </button>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 whitespace-pre-line leading-relaxed max-h-72 overflow-y-auto">
              {hospitalGuidance}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
