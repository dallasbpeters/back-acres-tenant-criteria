import type { invoices, rentSchedules } from "@/lib/db/schema";
import { dollars } from "@/lib/management/model";
import { paymentMode } from "@/lib/management/stripe";
export function PaymentHistory({
  payments,
  schedules,
}: {
  payments: (typeof invoices.$inferSelect)[];
  schedules: (typeof rentSchedules.$inferSelect)[];
}) {
  return (
    <>
      <h3>Payment history</h3>
      <p className="small-note">
        {paymentMode() === "test"
          ? "Test payments only. No real payments are collected."
          : "Payments shared by your property owner. Bank payments may take several business days to settle."}
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
        payments. Contact the owner to change the payment amount or bank
        account.
      </p>
    </>
  );
}
