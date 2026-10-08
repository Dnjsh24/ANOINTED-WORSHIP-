"use client";

import { useReportWebVitals } from "next/web-vitals";

function reportMetric(metric: Parameters<Parameters<typeof useReportWebVitals>[0]>[0]) {
  // Local measurement only: no telemetry endpoint, cookies, or paid service.
  window.dispatchEvent(new CustomEvent("anointed-web-vitals", {
    detail: { id: metric.id, name: metric.name, value: metric.value, rating: metric.rating },
  }));
}

export function WebsiteWebVitals() {
  useReportWebVitals(reportMetric);
  return null;
}
