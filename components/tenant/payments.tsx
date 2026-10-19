import type { invoices, paymentHistory, rentSchedules } from "@/lib/db/schema";
import { dollars } from "@/lib/management/model";
import { linkToken } from "@/lib/management/security";
import { paymentMode } from "@/lib/management/stripe";

const statusLabels: Record<string, string> = {
  open: "Due",
  paid: "Paid",
  processing: "Processing",
  uncollectible: "Not collected",
  void: "Canceled",
};
/** Schedules a tenant still has to connect a bank account to. */
const enrollable = new Set([
  "awaiting_authorization",
  "creating_checkout",
  "awaiting_verification",
]);
const running = new Set(["active", "not_started", "activating"]);
export function PaymentHistory({
  payments,
  schedules,
  history,
  contact = "Back Acres Rentals",
}: {
  contact?: string;
  payments: (typeof invoices.$inferSelect)[];
  schedules: (typeof rentSchedules.$inferSelect)[];
  history: (typeof paymentHistory.$inferSelect)[];
}) {
  return (
    <>
      <header className="tenant-section-head">
        <h3>Payments</h3>
        <p className="small-note">
          {paymentMode() === "test"
            ? "Test payments only. No real payments are collected."
            : "Payments shared by Back Acres Rentals. Bank payments may take several business days to settle."}
        </p>
      </header>
      {payments.length ? (
        <div className="tenant-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Payment</th>
                <th scope="col">Due</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Pay</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.description}</td>
                  <td>{payment.dueDate}</td>
                  <td>{dollars(payment.amountCents)}</td>
                  <td>
                    {statusLabels[payment.status] ?? payment.status}
                    {payment.paidAt
                      ? ` · ${payment.paidAt.toLocaleDateString("en-US", { timeZone: "America/Chicago" })}`
                      : ""}
                  </td>
                  <td>
                    {payment.status === "open" && (
                      <a
                        className="ui-button ui-button--primary tenant-pay-button"
                        href={`/pay/${linkToken("payment", payment.id)}`}
                      >
                        Pay now
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="tenant-empty-state">
          No payment records have been shared yet.
        </p>
      )}
      {!!history.length && (
        <details>
          <summary>Payment activity and refunds</summary>
          <p className="small-note">
            Recorded invoice changes. Older invoices begin with a baseline;
            earlier activity is available from Back Acres Rentals’ Stripe
            records. These entries are not a bank statement.
          </p>
          <ul className="tenant-request-list">
            {history.map((entry) => (
              <li key={entry.id}>
                <strong>
                  {
                    payments.find((payment) => payment.id === entry.invoiceId)
                      ?.description
                  }
                </strong>
                <span>
                  {entry.status.replaceAll("_", " ")} ·{" "}
                  {entry.observedAt.toLocaleString("en-US", {
                    timeZone: "America/Chicago",
                  })}
                </span>
                <span>
                  {dollars(entry.amountCents)}
                  {entry.refundedCents
                    ? ` · Refunded to date: ${dollars(entry.refundedCents)}`
                    : ""}
                </span>
                {entry.source === "migration_baseline" && (
                  <span>Migration baseline</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      <h4>Automatic payments</h4>
      {schedules.length ? (
        <ul className="tenant-schedule-list">
          {schedules.map((schedule) => (
            <li className="tenant-schedule" key={schedule.id}>
              <span>
                {dollars(schedule.monthlyCents)} per month ·{" "}
                {schedule.collection === "ach"
                  ? "automatic bank payment"
                  : "monthly invoice"}{" "}
                · from {schedule.firstDate}
                <span className="small-note">
                  {" "}
                  · {schedule.status.replaceAll("_", " ")}
                </span>
              </span>
              {schedule.collection === "ach" &&
                (enrollable.has(schedule.status) ||
                  running.has(schedule.status)) && (
                  <a
                    className={`ui-button ${enrollable.has(schedule.status) ? "ui-button--primary" : "ui-button--secondary"} tenant-pay-button`}
                    href={`/autopay/${linkToken("autopay", schedule.id)}`}
                  >
                    {enrollable.has(schedule.status)
                      ? "Set up automatic payments"
                      : "Manage automatic payments"}
                  </a>
                )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="tenant-empty-state">
          No automatic payment schedules have been shared.
        </p>
      )}
      {schedules.length > 0 && (
        <p className="small-note">
          Use your private enrollment link to authorize or stop automatic
          payments. Contact {contact} to change the payment amount or bank
          account.
        </p>
      )}
    </>
  );
}
