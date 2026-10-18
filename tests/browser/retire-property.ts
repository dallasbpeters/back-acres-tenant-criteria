import type { NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

/**
 * Test cleanup for a property that may have invoices. Payment history is
 * append-only (migration 0014) and references each invoice, so invoices, their
 * rent schedules, and the property cannot be deleted. Those are unpublished
 * and marked removed instead, which hides them from the public listings and
 * the owner workspace while keeping the audit history intact.
 */
export async function retireTestProperty(
  sql: Sql,
  propertyId: string,
  label: string
) {
  const [{ invoices }] =
    await sql`SELECT count(*)::int AS invoices FROM rental_invoices WHERE property_id=${propertyId}`;
  if (invoices === 0) {
    await sql`DELETE FROM rent_schedules WHERE property_id=${propertyId}`;
    await sql`DELETE FROM properties WHERE id=${propertyId}`;
    return;
  }
  await sql`DELETE FROM rent_schedules WHERE property_id=${propertyId} AND id NOT IN (SELECT billing_schedule_id FROM rental_invoices WHERE billing_schedule_id IS NOT NULL)`;
  await sql`UPDATE properties SET data = data || '{"published":false,"acceptingApplications":false}'::jsonb WHERE id=${propertyId}`;
  await sql`INSERT INTO removed_records(entity_id,group_id,kind,label,actor) VALUES(${propertyId},${propertyId},'property',${label},'browser-test-cleanup') ON CONFLICT (entity_id) DO NOTHING`;
}
