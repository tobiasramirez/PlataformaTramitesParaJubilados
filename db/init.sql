-- Corre automáticamente solo la PRIMERA vez que se crea el volumen pgdata.
CREATE ROLE api_tramites WITH LOGIN PASSWORD 'api_tramites_pass_sec99';
GRANT ALL PRIVILEGES ON DATABASE tramites_db TO api_tramites;

\connect tramites_db;

CREATE TABLE IF NOT EXISTS tramites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cuil_jubilado VARCHAR(11) NOT NULL,
    municipio_id INT NOT NULL,
    tipo_beneficio_id VARCHAR(50) NOT NULL,
    canal_origen VARCHAR(20) NOT NULL,
    estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_VALIDACION',
    verificado_padron BOOLEAN DEFAULT FALSE,
    creado_por VARCHAR(100) NOT NULL,
    datos_adicionales JSONB DEFAULT '{}'::jsonb,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    observacion_agente TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO api_tramites;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO api_tramites;