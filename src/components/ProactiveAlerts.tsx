"use client";

import { ProactiveAlert } from "@/types";

interface ProactiveAlertsProps {
  alerts: ProactiveAlert[];
  onAlertAction: (alert: ProactiveAlert) => void;
  onFocusCompany: (company: string) => void;
}

const SEVERITY_STYLES = {
  critical: {
    bg: "bg-red-50",
    border: "border-red-200",
    icon: "text-red-500",
    badge: "bg-red-100 text-red-700",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: "text-amber-500",
    badge: "bg-amber-100 text-amber-700",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: "text-blue-500",
    badge: "bg-blue-100 text-blue-700",
  },
};

const TYPE_ICONS = {
  deadline: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  stale: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  ),
  upcoming: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  action: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
};

export default function ProactiveAlerts({
  alerts,
  onAlertAction,
  onFocusCompany,
}: ProactiveAlertsProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="px-3 sm:px-4 py-3 space-y-2 border-b border-gray-100 bg-white">
      <div className="flex items-center gap-2 text-xs text-gray-400 font-medium uppercase tracking-wider">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        Alerts
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {alerts.map((alert) => {
          const styles = SEVERITY_STYLES[alert.severity];
          return (
            <div
              key={alert.id}
              className={`shrink-0 w-64 sm:w-72 ${styles.bg} ${styles.border} border rounded-xl p-3 cursor-pointer hover:shadow-sm transition`}
              onClick={() => onAlertAction(alert)}
            >
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 ${styles.icon}`}>
                  {TYPE_ICONS[alert.type]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-800 text-xs truncate">
                      {alert.title}
                    </p>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${styles.badge} flex-shrink-0`}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {alert.description}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {alert.actionLabel && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAlertAction(alert);
                        }}
                        className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                      >
                        {alert.actionLabel}
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFocusCompany(alert.company);
                      }}
                      className="text-[11px] text-gray-400 hover:text-gray-600 font-medium"
                    >
                      Focus {alert.company}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
