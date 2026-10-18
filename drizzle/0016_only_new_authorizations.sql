-- Preserve legacy authorizations without sending an unsolicited backfill when
-- an existing schedule's status changes. New consent gets a new immutable copy.
CREATE OR REPLACE FUNCTION queue_authorization_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.consented_at IS NOT DISTINCT FROM NEW.consented_at THEN
      RETURN NEW;
    END IF;
  END IF;
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
