import type { invoices, paymentHistory, rentSchedules } from "@/lib/db/schema";
import { dollars } from "@/lib/management/model";
import { paymentMode } from "@/lib/management/stripe";
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
      <h3>Payment history</h3>
      <p className="small-note">
        {paymentMode() === "test"
          ? "Test payments only. No real payments are collected."
          : "Payments shared by Back Acres Rentals. Bank payments may take several business days to settle."}
      </p>
      {payments.length ? (
        <div className="tenant-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Payment</th>
                <th scope="col">Due</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.description}</td>
                  <td>{payment.dueDate}</td>
                  <td>{dollars(payment.amountCents)}</td>
                  <td>
                    {payment.status}
                    {payment.paidAt
                      ? ` · ${payment.paidAt.toLocaleDateString("en-US", { timeZone: "America/Chicago" })}`
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No payment records have been shared yet.</p>
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
      <h3>Automatic payments</h3>
      {schedules.length ? (
        <ul>
          {schedules.map((schedule) => (
            <li key={schedule.id}>
              {dollars(schedule.monthlyCents)} per month ·{" "}
              {schedule.collection.toUpperCase()} ·{" "}
              {schedule.status.replaceAll("_", " ")}
            </li>
          ))}
        </ul>
      ) : (
        <p>No automatic payment schedules have been shared.</p>
      )}
      <p>
        Use your private enrollment link to authorize or stop automatic
        payments. Contact {contact} to change the payment amount or bank
        account.
      </p>
    </>
  );
}
