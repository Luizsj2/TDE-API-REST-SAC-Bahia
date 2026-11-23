-- Execute como sac_admin no Amazon RDS, após 01-schema.sql.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sac_app') THEN
        CREATE ROLE sac_app LOGIN;
    END IF;
END
$$;

GRANT CONNECT ON DATABASE sac TO sac_app;
GRANT USAGE ON SCHEMA public TO sac_app;
GRANT SELECT ON postos, chegadas TO sac_app;
GRANT INSERT (posto_id, protocolo) ON chegadas TO sac_app;
