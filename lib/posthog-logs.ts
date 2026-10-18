import "server-only";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";

const serviceName = "back-acres-tenant-criteria";

function createProvider() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!(key && host)) {
    // Isolated test servers deliberately omit PostHog settings. Missing
    // telemetry must never stop the application from serving requests.
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "PostHog server logs are off: set NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST."
      );
    }
    return;
  }
  return new LoggerProvider({
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          url: new URL("/i/v1/logs", host).toString(),
        }),
      }),
    ],
    resource: resourceFromAttributes({ "service.name": serviceName }),
  });
}

export const posthogLoggerProvider = createProvider();

const logger = posthogLoggerProvider?.getLogger(serviceName);

type PaymentRecoveryOutcome = "completed" | "failed";

export function logPaymentRecovery(outcome: PaymentRecoveryOutcome) {
  if (!logger) {
    return false;
  }

  logger.emit({
    attributes: {
      job: "payment_recovery",
      outcome,
    },
    body: "payment recovery job finished",
    severityNumber:
      outcome === "completed" ? SeverityNumber.INFO : SeverityNumber.ERROR,
  });
  return true;
}

export async function flushPosthogLogs() {
  await posthogLoggerProvider?.forceFlush();
}
