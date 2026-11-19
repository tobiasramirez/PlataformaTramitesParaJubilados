const express = require('express');
const { Pool } = require('pg');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const CANAL_BACKEND = process.env.CANAL_BACKEND || 'TELEFONICO';
const PADRON_MOCK_URL = process.env.PADRON_MOCK_URL || 'http://padron-mock:8081';
const OIDC_ISSUER_URL = process.env.OIDC_ISSUER_URL || 'http://keycloak:8080/realms/consorcio-regional';

// Conexión a PostgreSQL usando el usuario acotado (Hardening Clase 12)
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'tramites_db',
  user: process.env.DB_USER || 'api_tramites',
  password: process.env.DB_PASSWORD || 'api_tramites_pass_sec99',
});

// JWKS remoto de Keycloak para validar tokens JWT sin guardar secretos
const JWKS = createRemoteJWKSet(
  new URL(`${OIDC_ISSUER_URL}/protocol/openid-connect/certs`)
);

// Helper: Respuestas de error estándar RFC 9457 (Problem Details)
function sendProblem(res, status, title, detail, instance) {
  return res
    .status(status)
    .type('application/problem+json')
    .json({
      type: `https://tramites.consorcio.gob.ar/errors/${status}`,
      title,
      status,
      detail,
      instance,
    });
}

// Middleware 1: Autenticación OIDC (401 si falta token o firma inválida)
async function autenticarOIDC(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendProblem(res, 401, 'No autenticado', 'Falta el token Bearer en la cabecera Authorization.', req.originalUrl);
  }

  const token = authHeader.split(' ')[1];
  try {
    const { payload } = await jwtVerify(token, JWKS);
    const roles = payload.realm_access?.roles || [];
    req.user = {
      sub: payload.sub,
      roles,
      municipioId: payload.municipio_id ? Number(payload.municipio_id) : null,
    };
    next();
  } catch (err) {
    return sendProblem(res, 401, 'Token inválido', 'El token JWT expiró o su firma no es válida.', req.originalUrl);
  }
}

// Middleware 2: Autorización RBAC por rol (403 si no tiene permiso)
function requerirRol(rolesPermitidos) {
  return (req, res, next) => {
    const tienePermiso = req.user.roles.some((r) => rolesPermitidos.includes(r));
    if (!tienePermiso) {
      return sendProblem(res, 403, 'Acceso denegado', 'Su rol no posee permisos para ejecutar esta operación.', req.originalUrl);
    }
    next();
  };
}

// Healthcheck para Docker Compose
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', canal: CANAL_BACKEND });
});

// ---------------------------------------------------------------------------
// CASO DE USO 1: Iniciar solicitud de trámite (POST /api/v1/tramites)
// Roles: vecinoJubilado, agenteMunicipal (y cliente M2M WhatsApp)
// ---------------------------------------------------------------------------
app.post(
  '/api/v1/tramites',
  autenticarOIDC,
  requerirRol(['vecinoJubilado', 'agenteMunicipal']),
  async (req, res) => {
    const { cuilJubilado, municipioId, tipoBeneficioId, datosAdicionales } = req.body;

    if (!cuilJubilado || !/^\d{11}$/.test(cuilJubilado) || !municipioId || !tipoBeneficioId) {
      return sendProblem(res, 400, 'Solicitud inválida', 'Verifique cuilJubilado (11 dígitos), municipioId y tipoBeneficioId.', req.originalUrl);
    }

    try {
      // 1. Integración sincrónica con el Mock del Padrón Nacional
      const padronResp = await fetch(`${PADRON_MOCK_URL}/api/v1/jubilados/${cuilJubilado}`);
      if (!padronResp.ok) {
        return sendProblem(res, 502, 'Error de integración externa', 'No se pudo consultar el Padrón Nacional.', req.originalUrl);
      }
      const padronData = await padronResp.json();

      if (!padronData.esJubilado) {
        return sendProblem(res, 422, 'Regla de negocio incumplida', 'El CUIL ingresado no figura como jubilado activo en el Padrón Nacional.', req.originalUrl);
      }

      // 2. Persistencia en PostgreSQL
      const query = `
        INSERT INTO tramites (cuil_jubilado, municipio_id, tipo_beneficio_id, canal_origen, verificado_padron, creado_por, datos_adicionales)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      const values = [
        cuilJubilado,
        Number(municipioId),
        tipoBeneficioId,
        CANAL_BACKEND,
        true,
        req.user.sub,
        JSON.stringify(datosAdicionales || {}),
      ];

      const { rows } = await pool.query(query, values);
      return res.status(201).json(rows[0]);
    } catch (error) {
      console.error('Error al crear trámite:', error);
      // Nunca exponemos stack traces ni errores SQL (Hardening Clase 12)
      return sendProblem(res, 500, 'Error interno del servidor', 'Ocurrió un error inesperado procesando la solicitud.', req.originalUrl);
    }
  }
);

// ---------------------------------------------------------------------------
// CASO DE USO 2: Bandeja de trámites (GET /api/v1/tramites)
// Roles: Solo agenteMunicipal (filtrado ABAC por su municipio_id)
// ---------------------------------------------------------------------------
app.get(
  '/api/v1/tramites',
  autenticarOIDC,
  requerirRol(['agenteMunicipal']),
  async (req, res) => {
    try {
      // Regla fina ABAC: el agente solo ve trámites de SU propio municipio
      const { rows } = await pool.query(
        'SELECT * FROM tramites WHERE municipio_id = $1 ORDER BY fecha_creacion DESC',
        [req.user.municipioId]
      );
      return res.status(200).json(rows);
    } catch (error) {
      console.error('Error al listar trámites:', error);
      return sendProblem(res, 500, 'Error interno del servidor', 'No se pudieron recuperar los trámites.', req.originalUrl);
    }
  }
);

// ---------------------------------------------------------------------------
// CASO DE USO 3: Consultar detalle de trámite (GET /api/v1/tramites/:id)
// Roles: vecinoJubilado (solo propios) y agenteMunicipal (solo su municipio)
// ---------------------------------------------------------------------------
app.get(
  '/api/v1/tramites/:id',
  autenticarOIDC,
  requerirRol(['vecinoJubilado', 'agenteMunicipal']),
  async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM tramites WHERE id = $1', [req.params.id]);
      if (rows.length === 0) {
        return sendProblem(res, 404, 'No encontrado', 'El trámite solicitado no existe.', req.originalUrl);
      }

      const tramite = rows[0];
      const esAgente = req.user.roles.includes('agenteMunicipal');

      // Regla fina ABAC
      if (esAgente && tramite.municipio_id !== req.user.municipioId) {
        return sendProblem(res, 403, 'Acceso denegado', 'El trámite pertenece a otro municipio.', req.originalUrl);
      }
      if (!esAgente && tramite.creado_por !== req.user.sub) {
        return sendProblem(res, 403, 'Acceso denegado', 'Solo puede consultar sus propios trámites.', req.originalUrl);
      }

      return res.status(200).json(tramite);
    } catch (error) {
      console.error('Error al obtener trámite:', error);
      return sendProblem(res, 500, 'Error interno del servidor', 'Error al consultar el trámite.', req.originalUrl);
    }
  }
);

// ---------------------------------------------------------------------------
// CASO DE USO 4: Evaluar trámite (PATCH /api/v1/tramites/:id/estado)
// Roles: Solo agenteMunicipal (y debe pertenecer al mismo municipio)
// ---------------------------------------------------------------------------
app.patch(
  '/api/v1/tramites/:id/estado',
  autenticarOIDC,
  requerirRol(['agenteMunicipal']),
  async (req, res) => {
    const { estado, observacion } = req.body;
    if (!['APROBADO', 'RECHAZADO'].includes(estado) || !observacion) {
      return sendProblem(res, 400, 'Datos inválidos', 'Debe enviar estado (APROBADO/RECHAZADO) y una observación.', req.originalUrl);
    }

    try {
      const { rows } = await pool.query('SELECT * FROM tramites WHERE id = $1', [req.params.id]);
      if (rows.length === 0) {
        return sendProblem(res, 404, 'No encontrado', 'El trámite no existe.', req.originalUrl);
      }

      // Regla fina ABAC: el agente solo aprueba/rechaza trámites de SU municipio
      if (rows[0].municipio_id !== req.user.municipioId) {
        return sendProblem(res, 403, 'Acceso denegado', 'No puede evaluar trámites de otro municipio.', req.originalUrl);
      }

      const updated = await pool.query(
        'UPDATE tramites SET estado = $1, observacion_agente = $2 WHERE id = $3 RETURNING *',
        [estado, observacion, req.params.id]
      );
      return res.status(200).json(updated.rows[0]);
    } catch (error) {
      console.error('Error al actualizar estado:', error);
      return sendProblem(res, 500, 'Error interno del servidor', 'No se pudo actualizar el estado del trámite.', req.originalUrl);
    }
  }
);

app.listen(PORT, () => {
  console.log(`[${CANAL_BACKEND}] Servicio escuchando en el puerto ${PORT}`);
});