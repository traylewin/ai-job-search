"use client";

import { useState, useMemo } from "react";

interface CalendarEvent {
  id: string;
  googleEventId: string;
  title: string;
  company?: string;
  startTime: string;
  endTime: string;
  location?: string;
  eventType: string;
  googleCalendarLink?: string;
}

interface CalendarViewProps {
  events: CalendarEvent[];
  onSelectEvent: (eventId: string) => void;
}

const EVENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  interview: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-300" },
  phone_screen: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-300" },
  technical_interview: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-300" },
  onsite: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-300" },
  chat: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-300" },
  info_session: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-300" },
  other: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-300" },
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am to 8pm

export default function CalendarView({ events, onSelectEvent }: CalendarViewProps) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (let i = 0; i < 7; i++) map.set(i, []);

    for (const event of events) {
      const start = new Date(event.startTime);
      for (let i = 0; i < 7; i++) {
        if (isSameDay(start, days[i])) {
          map.get(i)!.push(event);
          break;
        }
      }
    }
    return map;
  }, [events, days]);

  const today = new Date();

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Week navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white shrink-0">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-800">
            {weekStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </h3>
          <button
            onClick={() => setWeekStart(getWeekStart(new Date()))}
            className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium hover:bg-violet-100 transition"
          >
            Today
          </button>
        </div>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Calendar grid */}
      <div className="flex flex-1 min-h-0 overflow-auto">
        {/* Time column */}
        <div className="w-14 shrink-0 border-r border-gray-100">
          <div className="h-10 border-b border-gray-100" />
          {HOURS.map((hour) => (
            <div key={hour} className="h-16 relative">
              <span className="absolute -top-2.5 right-2 text-[10px] text-gray-400">
                {hour === 0 ? "12am" : hour < 12 ? `${hour}am` : hour === 12 ? "12pm" : `${hour - 12}pm`}
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        <div className="flex flex-1 min-w-0">
          {days.map((day, dayIndex) => {
            const isToday = isSameDay(day, today);
            const dayEvents = eventsByDay.get(dayIndex) || [];

            return (
              <div
                key={dayIndex}
                className={`flex-1 min-w-[100px] border-r border-gray-100 last:border-r-0 ${
                  isToday ? "bg-violet-50/30" : ""
                }`}
              >
                {/* Day header */}
                <div className={`h-10 flex flex-col items-center justify-center border-b border-gray-100 ${
                  isToday ? "bg-violet-50" : ""
                }`}>
                  <span className="text-[10px] text-gray-400 uppercase">
                    {day.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <span className={`text-xs font-semibold ${
                    isToday ? "text-violet-600" : "text-gray-700"
                  }`}>
                    {day.getDate()}
                  </span>
                </div>

                {/* Hour slots */}
                <div className="relative">
                  {HOURS.map((hour) => (
                    <div key={hour} className="h-16 border-b border-gray-50" />
                  ))}

                  {/* Events overlay */}
                  {dayEvents.map((event) => {
                    const start = new Date(event.startTime);
                    const end = new Date(event.endTime);
                    const startHour = start.getHours() + start.getMinutes() / 60;
                    const endHour = end.getHours() + end.getMinutes() / 60;
                    const topOffset = Math.max(0, (startHour - 7) * 64);
                    const height = Math.max(24, (endHour - startHour) * 64);
                    const colors = EVENT_COLORS[event.eventType] || EVENT_COLORS.other;

                    return (
                      <button
                        key={event.id}
                        onClick={() => onSelectEvent(event.id)}
                        className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 text-left border overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${colors.bg} ${colors.text} ${colors.border}`}
                        style={{ top: `${topOffset}px`, height: `${height}px`, minHeight: "24px" }}
                        title={`${event.title}${event.company ? ` - ${event.company}` : ""}`}
                      >
                        <p className="text-[10px] font-semibold truncate leading-tight">
                          {event.company || event.title}
                        </p>
                        {height > 32 && (
                          <p className="text-[9px] opacity-75 truncate">
                            {formatTime(event.startTime)}
                          </p>
                        )}
                        {height > 48 && event.company && (
                          <p className="text-[9px] opacity-60 truncate">{event.title}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
