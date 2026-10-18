ALTER TABLE "payment_history" ADD COLUMN "source" text DEFAULT 'database_change' NOT NULL;
--> statement-breakpoint
-- Existing rows are a baseline observed at migration time, not reconstructed transactions.
INSERT INTO payment_history (id, invoice_id, observed_at, status, amount_cents,
  refunded_cents, paid_at, stripe_invoice_id, stripe_session_id, mode, source)
SELECT gen_random_uuid(), id, now(), status, amount_cents, refunded_cents,
  paid_at, stripe_invoice_id, stripe_session_id, mode, 'migration_baseline'
FROM rental_invoices;
--> statement-breakpoint
CREATE FUNCTION capture_payment_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(OLD.status, OLD.amount_cents, OLD.refunded_cents, OLD.paid_at,
           OLD.stripe_invoice_id, OLD.stripe_session_id, OLD.mode)
       IS NOT DISTINCT FROM
       ROW(NEW.status, NEW.amount_cents, NEW.refunded_cents, NEW.paid_at,
           NEW.stripe_invoice_id, NEW.stripe_session_id, NEW.mode) THEN
      RETURN NEW;
    END IF;
  END IF;
  INSERT INTO payment_history (id, invoice_id, observed_at, status, previous_status,
    amount_cents, refunded_cents, paid_at, stripe_invoice_id, stripe_session_id, mode)
  VALUES (gen_random_uuid(), NEW.id, clock_timestamp(), NEW.status,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.amount_cents, NEW.refunded_cents, NEW.paid_at, NEW.stripe_invoice_id,
    NEW.stripe_session_id, NEW.mode);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_history AFTER INSERT OR UPDATE ON rental_invoices
FOR EACH ROW EXECUTE FUNCTION capture_payment_history();
--> statement-breakpoint
CREATE FUNCTION protect_payment_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Payment history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER payment_history_immutable BEFORE UPDATE OR DELETE ON payment_history
FOR EACH ROW EXECUTE FUNCTION protect_payment_history();
--> statement-breakpoint
CREATE FUNCTION queue_authorization_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.consented_at IS NOT NULL AND NEW.authorization_text IS NOT NULL THEN
    INSERT INTO authorization_receipts
      (id, schedule_id, recipient, payer_name, authorization_text, consented_at)
    VALUES (md5(NEW.id::text || NEW.consented_at::text), NEW.id, NEW.payer_email,
      NEW.payer_name, NEW.authorization_text, NEW.consented_at)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER authorization_receipt AFTER INSERT OR UPDATE ON rent_schedules
FOR EACH ROW EXECUTE FUNCTION queue_authorization_receipt();
--> statement-breakpoint
CREATE FUNCTION protect_authorization_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Authorization evidence cannot be deleted';
  END IF;
  IF ROW(OLD.id, OLD.schedule_id, OLD.recipient, OLD.payer_name, OLD.authorization_text, OLD.consented_at)
    IS DISTINCT FROM
    ROW(NEW.id, NEW.schedule_id, NEW.recipient, NEW.payer_name, NEW.authorization_text, NEW.consented_at) THEN
    RAISE EXCEPTION 'Authorization evidence cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER authorization_receipt_immutable BEFORE UPDATE OR DELETE ON authorization_receipts
FOR EACH ROW EXECUTE FUNCTION protect_authorization_receipt();
