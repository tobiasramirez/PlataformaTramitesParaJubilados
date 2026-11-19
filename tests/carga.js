import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 10 }, // Subida gradual a 10 usuarios concurrentes
    { duration: '20s', target: 20 }, // Carga sostenida de 20 usuarios simultáneos
    { duration: '10s', target: 0 },  // Bajada controlada
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'], // NFR: 95% de las respuestas en menos de 1s
    http_req_failed: ['rate<0.01'],    // NFR: menos del 1% de errores
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal';

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/realms/consorcio-regional/protocol/openid-connect/token`,
    {
      client_id: 'portal-web',
      username: 'vecino1',
      password: 'vecino123',
      grant_type: 'password',
    }
  );

  check(loginRes, {
    'Token OIDC obtenido correctamente (200)': (r) => r.status === 200,
  });

  return { token: loginRes.json('access_token') };
}

export default function (data) {
  const params = {
    headers: {
      Authorization: `Bearer ${data.token}`,
      'Content-Type': 'application/json',
    },
  };

  // 1. Creación de trámite con validación al Mock del Padrón y persistencia en PostgreSQL
  const payload = JSON.stringify({
    cuilJubilado: '20123456788',
    municipioId: 4,
    tipoBeneficioId: 'TARIFA_SOCIAL_TRANSPORTE',
    datosAdicionales: { origenTest: 'k6-fitness-function' },
  });

 const postRes = http.post(`${BASE_URL}/api/v1/web/tramites`, payload, params);
  check(postRes, {
    'POST /api/v1/web/tramites responde 201': (r) => r.status === 201,
  });

  const tramiteId = postRes.json('id');
  if (tramiteId) {
    const getRes = http.get(`${BASE_URL}/api/v1/web/tramites/${tramiteId}`, params);
    check(getRes, {
      'GET /api/v1/web/tramites/:id responde 200': (r) => r.status === 200,
    });
  }

  sleep(0.5);
}