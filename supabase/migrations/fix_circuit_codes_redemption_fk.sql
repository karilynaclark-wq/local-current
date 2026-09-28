-- Deleting a redemption (e.g. when a user deletes their account) was blocked
-- by circuit_codes.redemption_id having no ON DELETE action. Unlink the code
-- instead: used codes keep is_used = true; unused codes return to the pool.
ALTER TABLE circuit_codes
  DROP CONSTRAINT circuit_codes_redemption_id_fkey,
  ADD CONSTRAINT circuit_codes_redemption_id_fkey
    FOREIGN KEY (redemption_id) REFERENCES redemptions(id) ON DELETE SET NULL;
