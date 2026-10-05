import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import {
  MessageSquare,
  Send,
  MapPin,
  Navigation,
  Phone,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Volume2,
  Building2,
  Compass,
  FileText,
  CheckCircle2,
} from "lucide-react";
import {
  ChatMessage,
  GroundingMapLink,
  HospitalFacility,
  PatientIntakeAnswers,
  PatientLocation,
  TriageAssessmentResult,
} from "../types/triage";

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const DEFAULT_LOCATION: PatientLocation = {
  lat: 37.7749,
  lng: -122.4194,
  label: "San Francisco Medical District, CA",
  source: "default",
};

interface PostDiagnosisChatAndReferralProps {
  intake: PatientIntakeAnswers;
  assessment: TriageAssessmentResult | null;
  onSendToMediaStudio: (title: string, content: string) => void;
}

interface HospitalPlacesControllerProps {
  userLocation: PatientLocation;
  searchQuery: string;
  urgencyLevel?: "low" | "medium" | "high";
  onHospitalsLoaded: (facilities: HospitalFacility[]) => void;
  onLocationUpdated: (loc: PatientLocation) => void;
  onSearchStateChange: (loading: boolean, error: string | null) => void;
  searchTriggerCount: number;
}

/**
 * Uses Places API (New) via `useMapsLibrary('places')` (`Place.searchNearby` and `Place.searchByText`)
 * to locate real nearby hospitals and emergency rooms without any legacy PlacesService calls.
 */
const HospitalPlacesController: React.FC<HospitalPlacesControllerProps> = ({
  userLocation,
  searchQuery,
  urgencyLevel,
  onHospitalsLoaded,
  onLocationUpdated,
  onSearchStateChange,
  searchTriggerCount,
}) => {
  const map = useMap();
  const placesLib = useMapsLibrary("places");
  const geometryLib = useMapsLibrary("geometry");

  useEffect(() => {
    if (!placesLib) return;
    let isCancelled = false;

    async function fetchNearbyHospitals() {
      onSearchStateChange(true, null);
      try {
        let targetCenter = { lat: userLocation.lat, lng: userLocation.lng };

        // If user typed a specific city/address query, search by text first using Places API (New)
        if (searchQuery.trim().length > 0 && searchTriggerCount > 0) {
          const textReq: google.maps.places.SearchByTextRequest = {
            textQuery: `${
              urgencyLevel === "high" ? "Emergency hospital trauma center" : "Hospital urgent care"
            } near ${searchQuery.trim()}`,
            fields: [
              "id",
              "displayName",
              "location",
              "formattedAddress",
              "nationalPhoneNumber",
              "regularOpeningHours",
              "rating",
              "userRatingCount",
              "googleMapsURI",
              "websiteURI",
            ],
            maxResultCount: 8,
          };

          const { places } = await placesLib!.Place.searchByText(textReq);
          if (isCancelled) return;

          if (places && places.length > 0) {
            const firstLoc = places[0].location;
            if (firstLoc) {
              targetCenter = { lat: firstLoc.lat(), lng: firstLoc.lng() };
              onLocationUpdated({
                lat: targetCenter.lat,
                lng: targetCenter.lng,
                label: searchQuery.trim(),
                source: "search",
              });
              map?.panTo(targetCenter);
              map?.setZoom(13);
            }

            const mapped: HospitalFacility[] = places
              .filter((p) => p.location)
              .map((p) => {
                const lat = p.location!.lat();
                const lng = p.location!.lng();
                let distanceKm: number | undefined;
                if (geometryLib) {
                  const meters = geometryLib.spherical.computeDistanceBetween(
                    new google.maps.LatLng(targetCenter.lat, targetCenter.lng),
                    new google.maps.LatLng(lat, lng)
                  );
                  distanceKm = Math.round((meters / 1000) * 10) / 10;
                }
                return {
                  id: p.id || `hosp-${lat}-${lng}`,
                  displayName: p.displayName || "Hospital / Medical Facility",
                  formattedAddress: p.formattedAddress || "",
                  location: { lat, lng },
                  rating: p.rating ?? undefined,
                  userRatingCount: p.userRatingCount ?? undefined,
                  nationalPhoneNumber: p.nationalPhoneNumber ?? undefined,
                  googleMapsURI: p.googleMapsURI ?? undefined,
                  websiteURI: p.websiteURI ?? undefined,
                  distanceKm,
                };
              });

            onHospitalsLoaded(mapped);
            onSearchStateChange(false, null);
            return;
          }
        }

        // Standard Nearby Hospital Search around patient coordinates using Place.searchNearby (Places API New)
        const nearbyReq: google.maps.places.SearchNearbyRequest = {
          fields: [
            "id",
            "displayName",
            "location",
            "formattedAddress",
            "nationalPhoneNumber",
            "regularOpeningHours",
            "rating",
            "userRatingCount",
            "googleMapsURI",
            "websiteURI",
          ],
          locationRestriction: {
            center: targetCenter,
            radius: 10000, // 10km radius
          },
          includedPrimaryTypes: ["hospital"],
          maxResultCount: 8,
          rankPreference: google.maps.places.SearchNearbyRankPreference.DISTANCE,
        };

        const { places } = await placesLib!.Place.searchNearby(nearbyReq);
        if (isCancelled) return;

        const mapped: HospitalFacility[] = (places || [])
          .filter((p) => p.location)
          .map((p) => {
            const lat = p.location!.lat();
            const lng = p.location!.lng();
            let distanceKm: number | undefined;
            if (geometryLib) {
              const meters = geometryLib.spherical.computeDistanceBetween(
                new google.maps.LatLng(targetCenter.lat, targetCenter.lng),
                new google.maps.LatLng(lat, lng)
              );
              distanceKm = Math.round((meters / 1000) * 10) / 10;
            }
            return {
              id: p.id || `hosp-${lat}-${lng}`,
              displayName: p.displayName || "Hospital / Emergency Center",
              formattedAddress: p.formattedAddress || "",
              location: { lat, lng },
              rating: p.rating ?? undefined,
              userRatingCount: p.userRatingCount ?? undefined,
              nationalPhoneNumber: p.nationalPhoneNumber ?? undefined,
              googleMapsURI: p.googleMapsURI ?? undefined,
              websiteURI: p.websiteURI ?? undefined,
              distanceKm,
            };
          });

        onHospitalsLoaded(mapped);
        map?.panTo(targetCenter);
        onSearchStateChange(false, null);
      } catch (err: any) {
        if (isCancelled) return;
        const msg = String(err?.message || err || "");
        if (
          msg.includes("OVER_QUERY_LIMIT") ||
          msg.includes("RESOURCE_EXHAUSTED") ||
          msg.includes("429") ||
          msg.includes("QuotaExceeded")
        ) {
          window.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
        }
        onSearchStateChange(
          false,
          "Could not load nearby hospitals from Places SDK. Use AI Grounded Hospital Referral below."
        );
      }
    }

    fetchNearbyHospitals();

    return () => {
      isCancelled = true;
    };
  }, [placesLib, geometryLib, userLocation.lat, userLocation.lng, searchTriggerCount]);

  return null;
};

export const PostDiagnosisChatAndReferral: React.FC<PostDiagnosisChatAndReferralProps> = ({
  intake,
  assessment,
  onSendToMediaStudio,
}) => {
  // Patient Location & Nearby Hospitals State
  const [userLocation, setUserLocation] = useState<PatientLocation>(DEFAULT_LOCATION);
  const [locationQueryInput, setLocationQueryInput] = useState<string>("");
  const [searchTriggerCount, setSearchTriggerCount] = useState<number>(0);
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);
  const [hospitals, setHospitals] = useState<HospitalFacility[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<HospitalFacility | null>(null);
  const [isLoadingHospitals, setIsLoadingHospitals] = useState<boolean>(false);
  const [hospitalSearchError, setHospitalSearchError] = useState<string | null>(null);

  // Grounded AI Referral Guidance State
  const [isFetchingGroundedReferral, setIsFetchingGroundedReferral] = useState<boolean>(false);
  const [groundedReferralMarkdown, setGroundedReferralMarkdown] = useState<string | null>(null);
  const [groundedPlaces, setGroundedPlaces] = useState<GroundingMapLink[]>([]);
  const [showHandoffCard, setShowHandoffCard] = useState<boolean>(false);

  // In-App Consultation Chat Room State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const isSeriousCondition =
    Boolean(assessment?.isEmergency) ||
    assessment?.urgencyLevel === "high" ||
    assessment?.urgencyLevel === "medium";

  // Seed or update initial AI welcome message in the chat room when assessment completes
  useEffect(() => {
    const urgencyNotice =
      assessment?.isEmergency || assessment?.urgencyLevel === "high"
        ? `🚨 **Urgent Referral Active:** Because your assessment indicates a potential medical emergency (${assessment.urgencyTitle}), I have activated the **Nearest Hospital & Emergency Room Referral Locator** beside this chat. Please seek immediate medical care or contact emergency services while following the immediate first-aid steps.`
        : assessment?.urgencyLevel === "medium"
        ? `🟡 **Medical Evaluation Recommended:** Your assessment (${assessment.urgencyTitle}) suggests having a healthcare professional examine this area. You can locate the nearest hospital or urgent care center on the map and ask me any follow-up questions here.`
        : `🟢 **Consultation Room Ready:** I have reviewed your ${intake.category.toLowerCase()} photo(s) and symptom intake (${
            assessment?.urgencyTitle || "Basic First-Aid Assessment"
          }). Ask me any follow-up questions about wound care, dressing changes, warning signs, or nearby clinics.`;

    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content: urgencyNotice,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isReferralAlert: isSeriousCondition,
      },
    ]);
  }, [assessment, intake.category, isSeriousCondition]);

  // Automatically scroll chat container when messages update
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isSendingChat]);

  const handleUseBrowserGps = () => {
    if (!navigator.geolocation) {
      setHospitalSearchError("Geolocation is not supported by this browser. Enter your city or ZIP code instead.");
      return;
    }
    setIsLocatingGps(true);
    setHospitalSearchError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLoc: PatientLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: `Current GPS (${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)})`,
          source: "gps",
        };
        setUserLocation(nextLoc);
        setIsLocatingGps(false);
        handleRunGroundedHospitalReferral(nextLoc.lat, nextLoc.lng, nextLoc.label);
      },
      (err) => {
        setIsLocatingGps(false);
        setHospitalSearchError(
          err.message ||
            "Browser location permission was declined. Enter your city, neighborhood, or postal code in the search box to find nearby hospitals."
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleRunGroundedHospitalReferral = useCallback(
    async (lat?: number, lng?: number, queryOverride?: string) => {
      setIsFetchingGroundedReferral(true);
      try {
        const res = await fetch("/api/refer-nearest-hospitals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: lat ?? userLocation.lat,
            longitude: lng ?? userLocation.lng,
            locationQuery: queryOverride ?? (locationQueryInput.trim() || userLocation.label),
            conditionCategory: intake.category,
            urgencyLevel: assessment?.urgencyLevel || "medium",
            symptomSummary: `${intake.whatHappened} (${intake.painStatus}, ${intake.bleedingStatus})`,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setGroundedReferralMarkdown(data.markdownGuidance || null);
          setGroundedPlaces(Array.isArray(data.places) ? data.places : []);
        }
      } catch (err) {
        console.error("Grounded hospital referral error:", err);
      } finally {
        setIsFetchingGroundedReferral(false);
      }
    },
    [userLocation, locationQueryInput, intake, assessment]
  );

  // Automatically trigger grounded hospital referral when a serious condition is detected
  useEffect(() => {
    if (isSeriousCondition) {
      handleRunGroundedHospitalReferral(userLocation.lat, userLocation.lng, userLocation.label);
    }
  }, [isSeriousCondition]);

  const handleSendMessage = async (questionText?: string) => {
    const textToSend = (questionText ?? chatInput).trim();
    if (!textToSend || isSendingChat) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    if (!questionText) setChatInput("");
    setIsSendingChat(true);

    try {
      const res = await fetch("/api/chat-consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: textToSend,
          chatHistory: updatedHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          intake,
          assessment,
          userLocation,
          nearbyHospitals: hospitals,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not get AI consultation response.");
      }

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        mapLinks: Array.isArray(data.mapLinks) && data.mapLinks.length > 0 ? data.mapLinks : undefined,
        referredHospitals:
          /hospital|emergency|urgent|clinic|refer|nearest/i.test(textToSend) && hospitals.length > 0
            ? hospitals.slice(0, 3)
            : undefined,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content:
            err?.message ||
            "I encountered a temporary connection issue. If you are experiencing severe symptoms, please contact your local emergency services or proceed to the nearest hospital.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleReferHospitalToChat = (hosp: HospitalFacility) => {
    setSelectedHospital(hosp);
    handleSendMessage(
      `I am considering going to ${hosp.displayName} (${hosp.formattedAddress}). Is this facility appropriate for my ${intake.category.toLowerCase()}, and what should I do before arriving?`
    );
  };

  const suggestedQuestions = [
    ...(assessment?.questionsForClinician || []),
    "Which nearest hospital or urgent care should I go to for treatment as soon as possible?",
    "How often should I clean and redress this area over the next 48 hours?",
    "What specific changes mean my condition is getting worse and needs emergency care?",
  ].slice(0, 5);

  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header Banner */}
      <div
        className={`border-b px-6 py-4 flex flex-wrap items-center justify-between gap-4 ${
          assessment?.isEmergency || assessment?.urgencyLevel === "high"
            ? "bg-red-950 border-red-800 text-white"
            : assessment?.urgencyLevel === "medium"
            ? "bg-amber-950 border-amber-800 text-white"
            : "bg-slate-900 border-slate-800 text-white"
        }`}
      >
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-300">
              04. POST-ASSESSMENT AI CONSULTATION &amp; HOSPITAL REFERRAL
            </span>
          </div>
          <h2 className="text-lg font-bold">
            {isSeriousCondition
              ? "🚨 Urgent Clinical Consultation & Nearest Hospital Referral"
              : "Interactive AI Consultation Room & Nearby Care Locator"}
          </h2>
          <p className="text-xs text-slate-300">
            Ask follow-up questions about your first-aid assessment or locate the nearest hospital and emergency department for prompt treatment.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowHandoffCard((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-colors whitespace-nowrap"
          >
            <FileText className="h-3.5 w-3.5" />
            {showHandoffCard ? "Hide Hospital Handoff Card" : "Prepare Hospital Triage Handoff"}
          </button>

          <button
            type="button"
            onClick={handleUseBrowserGps}
            disabled={isLocatingGps}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            {isLocatingGps ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Compass className="h-3.5 w-3.5" />
            )}
            Use My GPS Location
          </button>
        </div>
      </div>

      {/* Optional Printable/Shareable Hospital Triage Handoff Summary */}
      {showHandoffCard && (
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Patient Triage Handoff Summary (Show to Emergency / Urgent Care Staff)
            </h3>
            <button
              type="button"
              onClick={() =>
                onSendToMediaStudio(
                  "Hospital Triage Handoff Summary",
                  `Patient presenting with ${intake.category} at ${intake.bodyLocation}. Mechanism: ${intake.whatHappened}. Onset: ${intake.whenHappened}. Pain level: ${intake.painLevel} out of 10 (${intake.painStatus}). Bleeding status: ${intake.bleedingStatus}. Visual observation: ${
                    assessment?.cautiousObservationSummary || "Pending"
                  }.`
                )
              }
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 underline"
            >
              <Volume2 className="h-3.5 w-3.5" /> Create Spoken Audio Handoff
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-lg border border-slate-200 bg-white p-4 text-xs">
            <div>
              <p className="text-slate-500">Chief Complaint &amp; Location</p>
              <p className="font-semibold text-slate-900 mt-0.5">
                {intake.category} · {intake.bodyLocation}
              </p>
              <p className="text-slate-600 mt-1">Onset: {intake.whenHappened}</p>
            </div>
            <div>
              <p className="text-slate-500">Reported Symptoms &amp; Severity</p>
              <p className="font-semibold text-slate-900 mt-0.5 font-mono tabular-nums">
                Pain: {intake.painLevel}/10 ({intake.painStatus})
              </p>
              <p className="text-slate-600 mt-1">Bleeding: {intake.bleedingStatus}</p>
            </div>
            <div>
              <p className="text-slate-500">Target Referral Facility</p>
              <p className="font-semibold text-slate-900 mt-0.5">
                {selectedHospital?.displayName ||
                  hospitals[0]?.displayName ||
                  "Nearest Emergency Department"}
              </p>
              <p className="text-slate-600 mt-1">
                {selectedHospital?.formattedAddress ||
                  hospitals[0]?.formattedAddress ||
                  userLocation.label}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Split Grid: Left = In-App AI Consultation Chat Room (6 cols) | Right = Nearest Hospital Map & Referral (6 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        {/* LEFT 6 COLS: IN-APP AI CONSULTATION CHAT ROOM */}
        <div className="lg:col-span-6 flex flex-col justify-between p-6 space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-slate-900" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Post-Diagnosis AI Consultation Chat
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-500">
                Context: {intake.category}
              </span>
            </div>

            {/* Suggested Quick Questions */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-slate-500">
                Click a question to ask the AI or type your own below:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {suggestedQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(q)}
                    disabled={isSendingChat}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Message Stream */}
            <div
              ref={chatScrollRef}
              className="h-[420px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-3"
            >
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[90%] rounded-xl px-4 py-3 text-xs leading-relaxed space-y-2.5 ${
                      msg.role === "user"
                        ? "bg-slate-900 text-white"
                        : msg.isReferralAlert
                        ? "bg-red-50 border border-red-200 text-red-950"
                        : "bg-white border border-slate-200 text-slate-800 shadow-2xs"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 text-[11px] opacity-75 font-mono">
                      <span>
                        {msg.role === "user" ? "Patient" : "Clarion Clinical Assistant"}
                      </span>
                      <span>{msg.timestamp}</span>
                    </div>

                    <div className="whitespace-pre-wrap">{msg.content}</div>

                    {/* Grounded Google Maps Place Links inside Chat Message */}
                    {msg.mapLinks && msg.mapLinks.length > 0 && (
                      <div className="border-t border-slate-200/80 pt-2.5 space-y-1.5">
                        <p className="text-[11px] font-semibold text-slate-900">
                          Google Maps Grounded Medical Facilities:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.mapLinks.map((link, i) => (
                            <a
                              key={i}
                              href={link.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-900 hover:bg-slate-100"
                            >
                              <MapPin className="h-3 w-3 text-red-600" />
                              {link.title}
                              <ExternalLink className="h-2.5 w-2.5 text-slate-500" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Referred Hospital Cards inside Chat Message */}
                    {msg.referredHospitals && msg.referredHospitals.length > 0 && (
                      <div className="border-t border-slate-200/80 pt-2.5 space-y-1.5">
                        <p className="text-[11px] font-semibold text-slate-900">
                          Closest Verified Hospitals Near You:
                        </p>
                        {msg.referredHospitals.map((h) => (
                          <div
                            key={h.id}
                            className="rounded-md border border-slate-200 bg-slate-50 p-2 flex items-center justify-between gap-2"
                          >
                            <div>
                              <p className="font-semibold text-slate-900">{h.displayName}</p>
                              <p className="text-[11px] text-slate-600">
                                {h.formattedAddress}
                                {typeof h.distanceKm === "number"
                                  ? ` · ${h.distanceKm} km`
                                  : ""}
                              </p>
                            </div>
                            {h.googleMapsURI && (
                              <a
                                href={h.googleMapsURI}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                              >
                                Directions
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {msg.role === "assistant" && (
                      <div className="pt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            onSendToMediaStudio("Consultation Follow-Up Guidance", msg.content)
                          }
                          className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900 underline"
                        >
                          <Volume2 className="h-3 w-3" /> Convert Reply to Audio/Video
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isSendingChat && (
                <div className="flex items-center gap-2 text-xs text-slate-500 px-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Clarion AI is reviewing your assessment and nearby hospitals...
                </div>
              )}
            </div>
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2 pt-1"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask a question about your assessment, symptoms, or nearest hospital..."
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isSendingChat || !chatInput.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Send className="h-3.5 w-3.5" />
              Ask AI
            </button>
          </form>
        </div>

        {/* RIGHT 6 COLS: NEAREST HOSPITAL & EMERGENCY CARE REFERRAL MAP */}
        <div className="lg:col-span-6 p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-red-600" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Nearest Hospital &amp; Emergency Care Referral
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {hospitals.length} facilities found
              </span>
            </div>

            {/* Location Search / City Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSearchTriggerCount((c) => c + 1);
                handleRunGroundedHospitalReferral(
                  userLocation.lat,
                  userLocation.lng,
                  locationQueryInput.trim() || userLocation.label
                );
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={locationQueryInput}
                onChange={(e) => setLocationQueryInput(e.target.value)}
                placeholder="Enter your city, address, or postal code (or click Use My GPS)..."
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-900 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <MapPin className="h-3.5 w-3.5" />
                Find Hospitals
              </button>
            </form>

            {hospitalSearchError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                {hospitalSearchError}
              </div>
            )}

            {/* Interactive Google Map with AdvancedMarkers */}
            <div className="h-[260px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 relative">
              {MAPS_API_KEY ? (
                <APIProvider apiKey={MAPS_API_KEY}>
                  <Map
                    defaultCenter={{ lat: userLocation.lat, lng: userLocation.lng }}
                    defaultZoom={13}
                    mapId="DEMO_MAP_ID"
                    internalUsageAttributionIds={["gmp_mcp_codeassist_v1_aistudio"]}
                    gestureHandling="greedy"
                    style={{ width: "100%", height: "100%" }}
                  >
                    <HospitalPlacesController
                      userLocation={userLocation}
                      searchQuery={locationQueryInput}
                      urgencyLevel={assessment?.urgencyLevel}
                      onHospitalsLoaded={setHospitals}
                      onLocationUpdated={setUserLocation}
                      onSearchStateChange={(loading, err) => {
                        setIsLoadingHospitals(loading);
                        if (err) setHospitalSearchError(err);
                      }}
                      searchTriggerCount={searchTriggerCount}
                    />

                    {/* Patient Current Location Marker */}
                    <AdvancedMarker
                      position={{ lat: userLocation.lat, lng: userLocation.lng }}
                      title="Your Location"
                    >
                      <Pin
                        background="#0F172A"
                        borderColor="#FFFFFF"
                        glyphColor="#38BDF8"
                      />
                    </AdvancedMarker>

                    {/* Nearby Hospital Markers */}
                    {hospitals.map((hosp) => (
                      <AdvancedMarker
                        key={hosp.id}
                        position={hosp.location}
                        title={hosp.displayName}
                        onClick={() => setSelectedHospital(hosp)}
                      >
                        <Pin
                          background="#DC2626"
                          borderColor="#7F1D1D"
                          glyphColor="#FFFFFF"
                        />
                      </AdvancedMarker>
                    ))}

                    {selectedHospital && (
                      <InfoWindow
                        position={selectedHospital.location}
                        onCloseClick={() => setSelectedHospital(null)}
                      >
                        <div className="p-1 max-w-[220px] space-y-1 text-xs text-slate-900">
                          <p className="font-bold">{selectedHospital.displayName}</p>
                          <p className="text-[11px] text-slate-600">
                            {selectedHospital.formattedAddress}
                          </p>
                          {selectedHospital.nationalPhoneNumber && (
                            <p className="text-[11px] font-mono">
                              Tel: {selectedHospital.nationalPhoneNumber}
                            </p>
                          )}
                          {selectedHospital.googleMapsURI && (
                            <a
                              href={selectedHospital.googleMapsURI}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 underline pt-1"
                            >
                              Open in Google Maps <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      </InfoWindow>
                    )}
                  </Map>
                </APIProvider>
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-xs text-slate-500">
                  Google Maps API key not detected in environment. Use the Grounded Hospital Referral list below.
                </div>
              )}
            </div>

            {/* Nearest Hospital Referral Cards List */}
            <div className="space-y-2 max-h-[210px] overflow-y-auto pr-1">
              {isLoadingHospitals && (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-3">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Searching nearest hospitals &amp; emergency departments...
                </div>
              )}

              {!isLoadingHospitals &&
                hospitals.map((hosp, index) => (
                  <div
                    key={hosp.id}
                    className={`rounded-lg border p-3 text-xs transition-colors ${
                      selectedHospital?.id === hosp.id
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 bg-white hover:bg-slate-50/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">
                            0{index + 1}. {hosp.displayName}
                          </span>
                          {typeof hosp.distanceKm === "number" && (
                            <span className="font-mono text-[11px] text-emerald-700 tabular-nums">
                              {hosp.distanceKm} km
                            </span>
                          )}
                        </div>
                        <p className="text-slate-600 mt-0.5">{hosp.formattedAddress}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-slate-500 font-mono tabular-nums">
                          {hosp.rating && (
                            <span>
                              Rating: {hosp.rating} ({hosp.userRatingCount || 0})
                            </span>
                          )}
                          {hosp.nationalPhoneNumber && (
                            <span className="flex items-center gap-1 text-slate-700">
                              <Phone className="h-3 w-3" /> {hosp.nationalPhoneNumber}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {hosp.googleMapsURI && (
                          <a
                            href={hosp.googleMapsURI}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                          >
                            <Navigation className="h-3 w-3" />
                            Directions
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleReferHospitalToChat(hosp)}
                          className="text-[11px] font-medium text-slate-600 hover:text-slate-900 underline whitespace-nowrap"
                        >
                          Ask AI About Facility
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

              {/* Grounded Gemini Maps Referral Places & Guidance */}
              {groundedPlaces.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs">
                  <p className="font-semibold text-slate-900">
                    AI Grounded Hospital Referrals (Google Maps):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {groundedPlaces.map((pl, idx) => (
                      <a
                        key={idx}
                        href={pl.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-900 hover:bg-slate-100"
                      >
                        <MapPin className="h-3 w-3 text-red-600" />
                        {pl.title}
                        <ExternalLink className="h-2.5 w-2.5 text-slate-500" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {groundedReferralMarkdown && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 leading-relaxed space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      AI Referral Triage Guidance:
                    </span>
                    {isFetchingGroundedReferral && (
                      <RefreshCw className="h-3 w-3 animate-spin text-slate-500" />
                    )}
                  </div>
                  <p className="whitespace-pre-wrap">{groundedReferralMarkdown}</p>
                </div>
              )}
            </div>
          </div>

          {/* Emergency Disclaimer Footer inside Map Panel */}
          <div className="rounded-lg border border-red-200 bg-red-50/70 px-3.5 py-2.5 text-[11px] text-red-950 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-red-700 shrink-0" />
              If symptoms are life-threatening, call your local emergency number (e.g., 911 / 999 / 112) immediately rather than driving yourself.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
