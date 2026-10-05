import React, { useMemo, useState, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Minus,
  RotateCcw,
  Film,
  CheckCircle2,
} from "lucide-react";
import { TimelineCase, TimelineEntry } from "../types/triage";

export type DateFilterMode = "all" | "single" | "range";

export interface TimelineDateFilterState {
  mode: DateFilterMode;
  selectedDate: string; // YYYY-MM-DD
  rangeStart: string; // YYYY-MM-DD
  rangeEnd: string; // YYYY-MM-DD
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SHORT_MONTH_MAP: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/**
 * Resolves a reliable YYYY-MM-DD string from a TimelineEntry even if it was saved
 * before isoDate was explicitly stored.
 */
export function resolveEntryIsoDate(
  entry: TimelineEntry,
  caseCreatedAt?: string,
  index = 0
): string {
  if (entry.isoDate && /^\d{4}-\d{2}-\d{2}$/.test(entry.isoDate)) {
    return entry.isoDate;
  }

  // Try parsing labels like "Sep 28 · 09:15" or "Oct 04, 09:40"
  const match = entry.dateLabel.match(/([A-Za-z]{3})\s+(\d{1,2})/);
  const baseYear =
    caseCreatedAt && /^\d{4}/.test(caseCreatedAt)
      ? caseCreatedAt.slice(0, 4)
      : new Date().getFullYear().toString();

  if (match) {
    const monthNum = SHORT_MONTH_MAP[match[1].toLowerCase()];
    const dayNum = match[2].padStart(2, "0");
    if (monthNum) {
      return `${baseYear}-${monthNum}-${dayNum}`;
    }
  }

  // Fallback derived from caseCreatedAt + index days
  const fallbackBase = caseCreatedAt ? new Date(caseCreatedAt) : new Date();
  if (!isNaN(fallbackBase.getTime())) {
    const d = new Date(fallbackBase);
    d.setDate(d.getDate() + index * 2);
    return d.toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

export function formatIsoDateReadable(isoDate: string): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

interface TimelineCalendarAndProgressionSummaryProps {
  timelineCase: TimelineCase;
  dateFilter: TimelineDateFilterState;
  onChangeDateFilter: (next: TimelineDateFilterState) => void;
  onSendProgressionToStudio: (title: string, summaryText: string) => void;
}

export const TimelineCalendarAndProgressionSummary: React.FC<
  TimelineCalendarAndProgressionSummaryProps
> = ({
  timelineCase,
  dateFilter,
  onChangeDateFilter,
  onSendProgressionToStudio,
}) => {
  // Normalize all entries with resolved ISO dates and sort chronologically
  const normalizedEntries = useMemo(() => {
    return timelineCase.entries
      .map((entry, idx) => ({
        ...entry,
        resolvedIsoDate: resolveEntryIsoDate(entry, timelineCase.createdAt, idx),
      }))
      .sort((a, b) => a.resolvedIsoDate.localeCompare(b.resolvedIsoDate));
  }, [timelineCase]);

  // Group entries by YYYY-MM-DD for calendar lookup
  const entriesByDate = useMemo(() => {
    const map: Record<string, typeof normalizedEntries> = {};
    for (const item of normalizedEntries) {
      if (!map[item.resolvedIsoDate]) {
        map[item.resolvedIsoDate] = [];
      }
      map[item.resolvedIsoDate].push(item);
    }
    return map;
  }, [normalizedEntries]);

  // Determine initial visible calendar month based on latest entry
  const initialCalendarDate = useMemo(() => {
    const latestIso =
      normalizedEntries[normalizedEntries.length - 1]?.resolvedIsoDate ||
      new Date().toISOString().slice(0, 10);
    const [y, m] = latestIso.split("-").map(Number);
    return {
      year: y || new Date().getFullYear(),
      month: (m || new Date().getMonth() + 1) - 1, // 0-indexed
    };
  }, [normalizedEntries]);

  const [viewYear, setViewYear] = useState<number>(initialCalendarDate.year);
  const [viewMonth, setViewMonth] = useState<number>(initialCalendarDate.month);

  useEffect(() => {
    setViewYear(initialCalendarDate.year);
    setViewMonth(initialCalendarDate.month);
  }, [timelineCase.id, initialCalendarDate.year, initialCalendarDate.month]);

  // Build calendar grid cells for viewYear & viewMonth
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay(); // 0 (Sun) - 6 (Sat)
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells: Array<{
      dayNumber: number | null;
      isoDate: string | null;
      entries: typeof normalizedEntries;
    }> = [];

    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push({ dayNumber: null, isoDate: null, entries: [] });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = String(viewMonth + 1).padStart(2, "0");
      const dStr = String(d).padStart(2, "0");
      const iso = `${viewYear}-${mStr}-${dStr}`;
      cells.push({
        dayNumber: d,
        isoDate: iso,
        entries: entriesByDate[iso] || [],
      });
    }

    return cells;
  }, [viewYear, viewMonth, entriesByDate]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleDayCellClick = (isoDate: string) => {
    if (dateFilter.mode === "single" && dateFilter.selectedDate === isoDate) {
      // Toggle off filter if clicking the already-selected date
      onChangeDateFilter({
        ...dateFilter,
        mode: "all",
        selectedDate: "",
      });
    } else {
      const [y, m] = isoDate.split("-").map(Number);
      if (y && m) {
        setViewYear(y);
        setViewMonth(m - 1);
      }
      onChangeDateFilter({
        ...dateFilter,
        mode: "single",
        selectedDate: isoDate,
      });
    }
  };

  // Compute clinical progression statistics across normalizedEntries
  const progressionStats = useMemo(() => {
    if (normalizedEntries.length === 0) return null;
    const first = normalizedEntries[0];
    const last = normalizedEntries[normalizedEntries.length - 1];
    const painDelta = last.painLevel - first.painLevel;
    const peakPain = Math.max(...normalizedEntries.map((e) => e.painLevel));
    const minPain = Math.min(...normalizedEntries.map((e) => e.painLevel));

    const d1 = new Date(first.resolvedIsoDate);
    const d2 = new Date(last.resolvedIsoDate);
    const spanDays = Math.max(
      1,
      Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1
    );

    let overallDirection: "improving" | "worsening" | "stable" = "stable";
    if (painDelta < 0 || last.progressionStatus === "Getting better") {
      overallDirection = "improving";
    } else if (painDelta > 0 || last.progressionStatus === "Getting worse") {
      overallDirection = "worsening";
    }

    return {
      first,
      last,
      painDelta,
      peakPain,
      minPain,
      spanDays,
      overallDirection,
    };
  }, [normalizedEntries]);

  // SVG Chart Coordinates (Width: 640, Height: 215)
  const svgWidth = 640;
  const svgHeight = 215;
  const padLeft = 42;
  const padRight = 32;
  const padTop = 26;
  const padBottom = 46;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const chartPoints = useMemo(() => {
    const count = normalizedEntries.length;
    if (count === 0) return [];
    return normalizedEntries.map((entry, idx) => {
      const x =
        count === 1
          ? padLeft + plotW / 2
          : padLeft + (idx / (count - 1)) * plotW;
      const clampedPain = Math.max(0, Math.min(10, entry.painLevel));
      const y = padTop + plotH - (clampedPain / 10) * plotH;
      return {
        x,
        y,
        entry,
      };
    });
  }, [normalizedEntries, plotW, plotH]);

  const polylinePoints = useMemo(
    () => chartPoints.map((pt) => `${pt.x},${pt.y}`).join(" "),
    [chartPoints]
  );

  const areaPath = useMemo(() => {
    if (chartPoints.length < 2) return "";
    const firstPt = chartPoints[0];
    const lastPt = chartPoints[chartPoints.length - 1];
    const linePart = chartPoints.map((pt) => `L ${pt.x} ${pt.y}`).join(" ");
    return `M ${firstPt.x} ${padTop + plotH} ${linePart} L ${lastPt.x} ${
      padTop + plotH
    } Z`;
  }, [chartPoints, plotH]);

  const isDateActiveInFilter = (isoDate: string) => {
    if (dateFilter.mode === "single") {
      return dateFilter.selectedDate === isoDate;
    }
    if (dateFilter.mode === "range") {
      const afterStart =
        !dateFilter.rangeStart || isoDate >= dateFilter.rangeStart;
      const beforeEnd = !dateFilter.rangeEnd || isoDate <= dateFilter.rangeEnd;
      return afterStart && beforeEnd;
    }
    return false;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* LEFT PANEL (5 cols): Interactive Date-Picker Calendar & Date Filter Controls */}
      <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between space-y-4">
        <div className="space-y-4">
          {/* Header & Filter Mode Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-slate-900" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Timeline Date-Picker Calendar
                </h2>
                <p className="text-[11px] text-slate-500">
                  Click a highlighted date or choose a date range to filter checkpoints
                </p>
              </div>
            </div>

            {dateFilter.mode !== "all" && (
              <button
                type="button"
                onClick={() =>
                  onChangeDateFilter({
                    mode: "all",
                    selectedDate: "",
                    rangeStart: "",
                    rangeEnd: "",
                  })
                }
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <RotateCcw className="h-3 w-3" /> Reset Filter
              </button>
            )}
          </div>

          {/* Filter Mode Selector (All Dates / Specific Date / Date Range) */}
          <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-slate-100 p-1 text-xs font-medium">
            {(
              [
                ["all", "All Dates"],
                ["single", "Specific Date"],
                ["range", "Date Range"],
              ] as const
            ).map(([modeKey, label]) => (
              <button
                key={modeKey}
                type="button"
                onClick={() => {
                  if (modeKey === "all") {
                    onChangeDateFilter({
                      ...dateFilter,
                      mode: "all",
                      selectedDate: "",
                    });
                  } else if (modeKey === "single") {
                    const fallbackDate =
                      dateFilter.selectedDate ||
                      normalizedEntries[0]?.resolvedIsoDate ||
                      new Date().toISOString().slice(0, 10);
                    onChangeDateFilter({
                      ...dateFilter,
                      mode: "single",
                      selectedDate: fallbackDate,
                    });
                  } else {
                    const startDefault =
                      dateFilter.rangeStart ||
                      normalizedEntries[0]?.resolvedIsoDate ||
                      "";
                    const endDefault =
                      dateFilter.rangeEnd ||
                      normalizedEntries[normalizedEntries.length - 1]
                        ?.resolvedIsoDate ||
                      "";
                    onChangeDateFilter({
                      ...dateFilter,
                      mode: "range",
                      rangeStart: startDefault,
                      rangeEnd: endDefault,
                    });
                  }
                }}
                className={`rounded-md py-1.5 transition-colors whitespace-nowrap ${
                  dateFilter.mode === modeKey
                    ? "bg-white text-slate-900 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Direct Native Date Input(s) for rapid keyboard/picker selection */}
          {dateFilter.mode === "single" && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <label
                htmlFor="timeline-single-date"
                className="text-xs font-medium text-slate-700"
              >
                Selected Date:
              </label>
              <input
                id="timeline-single-date"
                type="date"
                value={dateFilter.selectedDate}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    const [y, m] = val.split("-").map(Number);
                    if (y && m) {
                      setViewYear(y);
                      setViewMonth(m - 1);
                    }
                  }
                  onChangeDateFilter({
                    ...dateFilter,
                    mode: val ? "single" : "all",
                    selectedDate: val,
                  });
                }}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
          )}

          {dateFilter.mode === "range" && (
            <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={dateFilter.rangeStart}
                  onChange={(e) =>
                    onChangeDateFilter({
                      ...dateFilter,
                      mode: "range",
                      rangeStart: e.target.value,
                    })
                  }
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={dateFilter.rangeEnd}
                  onChange={(e) =>
                    onChangeDateFilter({
                      ...dateFilter,
                      mode: "range",
                      rangeEnd: e.target.value,
                    })
                  }
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Monthly Calendar Header */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-xs font-bold tracking-wide text-slate-900 font-mono">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Calendar Day-of-Week Headers */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-mono font-medium text-slate-400">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell, idx) => {
              if (!cell.dayNumber || !cell.isoDate) {
                return <div key={`empty-${idx}`} className="h-11" />;
              }

              const hasEntries = cell.entries.length > 0;
              const isSelected = isDateActiveInFilter(cell.isoDate);
              const primaryEntry = cell.entries[0];

              let dotColor = "bg-emerald-600";
              if (primaryEntry) {
                if (
                  primaryEntry.urgencyLevel === "high" ||
                  primaryEntry.painLevel >= 7
                ) {
                  dotColor = "bg-red-600";
                } else if (
                  primaryEntry.urgencyLevel === "medium" ||
                  primaryEntry.painLevel >= 4
                ) {
                  dotColor = "bg-amber-500";
                }
              }

              return (
                <button
                  key={cell.isoDate}
                  type="button"
                  onClick={() => handleDayCellClick(cell.isoDate!)}
                  title={
                    hasEntries
                      ? `${cell.entries.map((e) => `${e.dayLabel} (Pain ${e.painLevel}/10)`).join(", ")} — Click to filter`
                      : `Select ${cell.isoDate}`
                  }
                  className={`relative h-11 rounded-lg border text-xs font-mono tabular-nums flex flex-col items-center justify-center transition-all ${
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white font-bold shadow-xs"
                      : hasEntries
                      ? "border-slate-300 bg-slate-50 text-slate-900 font-semibold hover:border-slate-900"
                      : "border-transparent text-slate-600 hover:bg-slate-50 hover:border-slate-200"
                  }`}
                >
                  <span>{cell.dayNumber}</span>
                  {hasEntries && (
                    <span
                      className={`mt-0.5 text-[9px] leading-none px-1 py-0.5 rounded font-mono ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-slate-200/80 text-slate-800"
                      }`}
                    >
                      {primaryEntry.dayLabel}
                    </span>
                  )}
                  {hasEntries && !isSelected && (
                    <span
                      className={`absolute top-1 right-1 h-1.5 w-1.5 rounded-full ${dotColor}`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Recorded Checkpoint Date Shortcut Buttons */}
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Jump to Recorded Checkpoint Date:</span>
            <span className="font-mono">
              {normalizedEntries.length} total dates
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {normalizedEntries.map((entry) => {
              const active =
                dateFilter.mode === "single" &&
                dateFilter.selectedDate === entry.resolvedIsoDate;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => handleDayCellClick(entry.resolvedIsoDate)}
                  className={`px-2.5 py-1 rounded-md border text-xs font-mono tabular-nums transition-colors ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white font-semibold"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {entry.dayLabel} · {entry.resolvedIsoDate.slice(5)}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* RIGHT PANEL (7 cols): Visual Summary of Symptom Progression Over Time */}
      <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between space-y-5">
        <div className="space-y-4">
          {/* Header & Audio/Video Export Trigger */}
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <span className="text-xs font-mono text-slate-500">
                VISUAL SYMPTOM &amp; PAIN PROGRESSION SUMMARY
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-0.5">
                Symptom Trajectory Over Time ({normalizedEntries.map((e) => e.dayLabel).join(" → ")})
              </h2>
            </div>

            {progressionStats && (
              <button
                type="button"
                onClick={() => {
                  const summaryScript = `Symptom Progression Summary for ${
                    timelineCase.title
                  }. Tracked across ${normalizedEntries.length} checkpoints (${normalizedEntries
                    .map(
                      (e) =>
                        `${e.dayLabel} on ${formatIsoDateReadable(
                          e.resolvedIsoDate
                        )}: Pain ${e.painLevel} out of 10, status ${e.progressionStatus}`
                    )
                    .join("; ")}). Net pain change is ${
                    progressionStats.painDelta > 0
                      ? `+${progressionStats.painDelta}`
                      : progressionStats.painDelta
                  } points on the 10-point scale.`;
                  onSendProgressionToStudio(
                    `Symptom Progression Chart Summary (${timelineCase.title})`,
                    summaryScript
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <Film className="h-3.5 w-3.5 text-slate-700" />
                Audio / Video for Progression
              </button>
            )}
          </div>

          {/* 3-Column Clinical KPI Summary Strip */}
          {progressionStats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-1">
                <span className="text-[11px] font-mono text-slate-500">
                  PAIN INTENSITY CHANGE
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                    {progressionStats.first.painLevel}/10 →{" "}
                    {progressionStats.last.painLevel}/10
                  </span>
                  <span
                    className={`text-xs font-mono font-semibold tabular-nums ${
                      progressionStats.painDelta < 0
                        ? "text-emerald-700"
                        : progressionStats.painDelta > 0
                        ? "text-red-700"
                        : "text-slate-600"
                    }`}
                  >
                    ({progressionStats.painDelta > 0 ? "+" : ""}
                    {progressionStats.painDelta})
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Peak: {progressionStats.peakPain}/10 · Lowest:{" "}
                  {progressionStats.minPain}/10
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-1">
                <span className="text-[11px] font-mono text-slate-500">
                  REPORTED SYMPTOM TREND
                </span>
                <div className="flex items-center gap-1.5">
                  {progressionStats.overallDirection === "improving" ? (
                    <>
                      <TrendingDown className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm font-bold text-emerald-800">
                        Improving Trajectory
                      </span>
                    </>
                  ) : progressionStats.overallDirection === "worsening" ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-bold text-red-800">
                        Worsening — Evaluate
                      </span>
                    </>
                  ) : (
                    <>
                      <Minus className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-bold text-amber-900">
                        Stable / Monitoring
                      </span>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Latest: {progressionStats.last.progressionStatus}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-1">
                <span className="text-[11px] font-mono text-slate-500">
                  OBSERVATION TIMESPAN
                </span>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-900">
                  {progressionStats.spanDays} Day
                  {progressionStats.spanDays > 1 ? "s" : ""} ({normalizedEntries.length}{" "}
                  Photos)
                </div>
                <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                  {progressionStats.first.resolvedIsoDate} →{" "}
                  {progressionStats.last.resolvedIsoDate}
                </p>
              </div>
            </div>
          )}

          {/* SVG Visual Pain & Symptom Progression Line Chart */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1 px-1">
              <span className="font-medium text-slate-700">
                Pain Scale (0–10) &amp; Visual Checkpoint Progression (Click any point to filter date)
              </span>
              <div className="flex items-center gap-3 font-mono">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-600 inline-block" /> Low (0–3)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> Mod (4–6)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-600 inline-block" /> High (7–10)
                </span>
              </div>
            </div>

            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-48 overflow-visible"
              role="img"
              aria-label="Visual chart of patient pain and symptom progression over time"
            >
              <defs>
                <linearGradient id="painAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0f172a" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* Horizontal Reference Lines for Pain 0, 2, 5, 8, 10 */}
              {[0, 2, 5, 8, 10].map((val) => {
                const yPos = padTop + plotH - (val / 10) * plotH;
                return (
                  <g key={val}>
                    <line
                      x1={padLeft}
                      y1={yPos}
                      x2={svgWidth - padRight}
                      y2={yPos}
                      stroke="#e2e8f0"
                      strokeDasharray={val === 0 ? undefined : "3 3"}
                      strokeWidth="1"
                    />
                    <text
                      x={padLeft - 8}
                      y={yPos + 3}
                      textAnchor="end"
                      className="fill-slate-400 text-[10px] font-mono"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Shaded Area under progression curve */}
              {areaPath && <path d={areaPath} fill="url(#painAreaGrad)" />}

              {/* Connecting Line */}
              {chartPoints.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylinePoints}
                />
              )}

              {/* Data Nodes */}
              {chartPoints.map(({ x, y, entry }) => {
                const isSelected = isDateActiveInFilter(entry.resolvedIsoDate);
                const nodeFill =
                  entry.painLevel >= 7
                    ? "#dc2626"
                    : entry.painLevel >= 4
                    ? "#d97706"
                    : "#059669";

                return (
                  <g
                    key={entry.id}
                    className="cursor-pointer"
                    onClick={() => handleDayCellClick(entry.resolvedIsoDate)}
                  >
                    {isSelected && (
                      <circle
                        cx={x}
                        cy={y}
                        r={11}
                        fill="none"
                        stroke="#0f172a"
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                      />
                    )}
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected ? 7 : 5.5}
                      fill={nodeFill}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />

                    {/* Pain score callout above point */}
                    <text
                      x={x}
                      y={y - 11}
                      textAnchor="middle"
                      className="fill-slate-900 text-[10px] font-mono font-bold"
                    >
                      {entry.painLevel}/10
                    </text>

                    {/* X-axis Day Label & ISO Date */}
                    <text
                      x={x}
                      y={padTop + plotH + 16}
                      textAnchor="middle"
                      className="fill-slate-900 text-[11px] font-mono font-semibold"
                    >
                      {entry.dayLabel}
                    </text>
                    <text
                      x={x}
                      y={padTop + plotH + 30}
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px] font-mono"
                    >
                      {entry.resolvedIsoDate.slice(5)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Chronological Progression Step Strip */}
        <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span>
              Clinical Note: Visual chart reflects patient-reported pain and surface observations, not a confirmed medical diagnosis.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};
