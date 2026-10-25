-- Profesionales que pueden emitir segundas opiniones (login con RUT + clave)
USE rmdental;

CREATE TABLE IF NOT EXISTS profesionales (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  rut          VARCHAR(12)  NOT NULL UNIQUE,      -- normalizado: 12345678-9
  nombre       VARCHAR(120) NOT NULL,
  especialidad VARCHAR(120) NULL,
  clinica      VARCHAR(120) NULL,
  comuna       VARCHAR(80)  NULL,
  telefono     VARCHAR(40)  NULL,
  correo       VARCHAR(120) NULL,
  clave_hash   VARCHAR(100) NOT NULL,             -- bcrypt, nunca la clave en texto
  activo       TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Si tu usuario rmdental_app tiene permisos limitados, agrega:
-- GRANT SELECT ON rmdental.profesionales TO 'rmdental_app'@'localhost';

-- Dar de baja a un profesional (no borra sus datos):
-- UPDATE profesionales SET activo = 0 WHERE rut = '12345678-9';
