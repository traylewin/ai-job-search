"use client";

import { formatFriendlyDate, formatFullDate } from "@/lib/date";

interface DateDisplayProps {
  date: string | number | Date;
  now?: number;
  className?: string;
}

export default function DateDisplay({ date, now, className = "" }: DateDisplayProps) {
  return (
    <span className={className} title={formatFullDate(date)}>
      {formatFriendlyDate(date, now)}
    </span>
  );
}
