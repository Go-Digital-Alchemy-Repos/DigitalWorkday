ALTER TABLE clients ALTER COLUMN stage DROP NOT NULL;

UPDATE clients
SET stage = NULL
WHERE status = 'inactive';
