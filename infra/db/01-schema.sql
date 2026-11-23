CREATE TABLE IF NOT EXISTS postos (
    id text PRIMARY KEY,
    posto text NOT NULL,
    latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    tempo_espera_minutos integer NOT NULL CHECK (tempo_espera_minutos >= 0)
);

CREATE TABLE IF NOT EXISTS chegadas (
    posto_id text REFERENCES postos(id),
    protocolo text,
    registrado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (posto_id, protocolo)
);

INSERT INTO postos (id, posto, latitude, longitude, tempo_espera_minutos) VALUES
    ('feira', 'SAC Feira de Santana', -12.2563, -38.9586, 45),
    ('shopping_bahia', 'SAC Shopping da Bahia', -12.9786, -38.4512, 120),
    ('salvador', 'SAC Salvador', -12.9769, -38.4553, 30)
ON CONFLICT (id) DO NOTHING;
