# Plataforma Regional Multicanal de Gestión de Trámites para Jubilados

Sistema distribuido para la gestión, validación y seguimiento de trámites y beneficios sociales de adultos mayores pertenecientes a un consorcio de 12 municipios. Permite iniciar y consultar gestiones de forma unificada a través de tres canales de atención (**Web**, **WhatsApp** y **Atención Telefónica**), garantizando consistencia transaccional, seguridad mediante identidad federada y trazabilidad completa.

---

## Arquitectura del Sistema

La solución implementa una **Arquitectura Modular Orientada por Canal** desplegada en contenedores Docker, segmentada en dos redes virtuales (`frontend-net` y `backend-net` con `internal: true`) para minimizar la superficie de ataque:

1. **`api-gateway` (Nginx):** Único punto de entrada expuesto al exterior (puerto `80`). Enruta las peticiones hacia el IdP y los distintos canales.
2. **`backend-web` (Node.js / Express - Puerto interno `3001`):** Servicio dedicado al canal Web.
3. **`backend-whatsapp` (Node.js / Express - Puerto interno `3002`):** Servicio dedicado a la integración con mensajería instantánea.
4. **`backend-telefonico` (Node.js / Express - Puerto interno `3003`):** Servicio dedicado a operadores de atención telefónica.
5. **`keycloak` (Keycloak 24 - Puerto interno `8080`):** Proveedor de Identidad (IdP) bajo estándar OpenID Connect (OIDC) para emisión y firma de tokens JWT.
6. **`db` (PostgreSQL 16 - Puerto interno `5432`):** Base de datos relacional compartida con garantías ACID, accedida mediante un usuario aplicativo con privilegios mínimos (`api_tramites`).
7. **`padron-mock` (Node.js / Express - Puerto interno `4000`):** Servicio simulado del Padrón Nacional para validación de vigencia y datos del CUIL del jubilado.
8. **`swagger-ui` (Puerto `8080`):** Documentación interactiva del contrato de API bajo especificación OpenAPI 3.0.

### Decisiones Arquitectónicas Clave (ADRs)
* **ADR-001 y 002:** Separación de backends por canal de atención con modelo de dominio compartido.
* **ADR-003:** Base de datos relacional centralizada en PostgreSQL para consistencia inmediata entre canales.
* **ADR-004:** Autenticación centralizada OIDC (Keycloak) y autorización híbrida **RBAC + ABAC** (validación de rol y `municipio_id`).
* **ADR-005:** Estandarización de respuestas de error HTTP según **RFC 9457** (`application/problem+json`).

---

## Requisitos Previos

* **Docker Desktop** (o Docker Engine) v24+
* **Docker Compose** v2+
* **Node.js** v20+ *(opcional, únicamente para ejecutar el análisis estático con `dependency-cruiser`)*

---

## Instalación y Despliegue

1. **Clonar el repositorio y ubicarse en la raíz del proyecto:**
   git clone https://github.com/tobiasramirez/PlataformaTramitesParaJubilados
   cd PlataformaTramitesParaJubilados

2. Configurar las variables de entorno
   cp .env.example .env
3. Construir y levantar toda la infraestructura:
   docker compose up -d --build
4. Verificar que los 8 contenedores estén operativos
   docker compose ps
(Nota: Keycloak demora aproximadamente 25-30 segundos en inicializar e importar el realm consorcio-regional).
5. Endpoints y Acceso
API Gateway (Punto de entrada principal): http://localhostAutenticación 
OIDC: POST http://localhost/realms/consorcio-regional/protocol/openid-connect/tokenCanal 
Web: http://localhost/api/v1/web/tramitesCanal 
WhatsApp: http://localhost/api/v1/whatsapp/tramitesCanal 
Telefónico: http://localhost/api/v1/telefonico/tramitesDocumentación 
OpenAPI (Swagger UI): http://localhost:8080
6. Usuarios de Prueba (Keycloak)
El realm consorcio-regional (cliente portal-web) incluye usuarios preconfigurados para validar los controles de acceso RBAC y ABAC.

7. Comandos en powershell para las pruebas
# 1. Login como vecino1
$respVecino = Invoke-RestMethod -Method Post -Uri "http://localhost/realms/consorcio-regional/protocol/openid-connect/token" `
  -ContentType "application/x-www-form-urlencoded" `
  -Body @{
    client_id  = "portal-web"
    username   = "vecino1"
    password   = "vecino123"
    grant_type = "password"
  }
$tokenVecino =$respVecino.access_token

# 2. Creación de trámite por canal Web
$bodyTramite = @{
  cuilJubilado     = "20123456788"
  municipioId      = 4
  tipoBeneficioId  = "TARIFA_SOCIAL_TRANSPORTE"
  datosAdicionales = @{ domicilio = "Av. Roca 123" }
} | ConvertTo-Json

$tramiteCreado = Invoke-RestMethod -Method Post -Uri "http://localhost/api/v1/web/tramites" `
  -Headers @{ Authorization = "Bearer $tokenVecino" } `
  -ContentType "application/json" `
  -Body $bodyTramite

$tramiteId = $tramiteCreado.id
Write-Host "Trámite creado ID: $tramiteId"

# 3. Login como agente_muni4
$respAgente = Invoke-RestMethod -Method Post -Uri "http://localhost/realms/consorcio-regional/protocol/openid-connect/token" `
  -ContentType "application/x-www-form-urlencoded" `
  -Body @{
    client_id  = "portal-web"
    username   = "agente_muni4"
    password   = "agente123"
    grant_type = "password"
  }
$tokenAgente = $respAgente.access_token

# 4. Aprobación del trámite por el agente del Municipio 4
$tramiteAprobado = Invoke-RestMethod -Method Patch -Uri "http://localhost/api/v1/web/tramites/$tramiteId/estado" `
  -Headers @{ Authorization = "Bearer $tokenAgente" } `
  -ContentType "application/json" `
  -Body '{"estado":"APROBADO","observacion":"Documentacion verificada correctamente"}'

$tramiteAprobado

# 8. Verificación de Arquitectura (Fitness Functions)
El repositorio incluye pruebas automatizadas y ejecutables para validar los atributos de calidad (NFRs) definidos en la arquitectura

Rendimiento y Disponibilidad bajo Concurrencia (k6)Evalúa latencia (p95 < 1000 ms) y tasa de error (< 1%) ante 20 usuarios concurrentes autenticados contra Keycloak realizando altas (POST) y consultas (GET):PowerShelldocker run --rm -i --add-host=host.docker.internal:host-gateway -v "${PWD}/tests:/tests" grafana/k6 run /tests/carga.js
Resultados obtenidos:http_req_duration: p(95) = 10.28 ms (Umbral < 1000 ms cumplido)http_req_failed: 0.00% (1747 / 1747 checks exitosos a ~43 req/s)2. 

Arquitectura en Capas y Dependencias (dependency-cruiser)Verifica la ausencia de dependencias circulares y garantiza que las rutas/controladores no accedan directamente a la capa de persistencia (db.js):PowerShellnpx --yes dependency-cruiser --config .dependency-cruiser.js backend-web/src backend-whatsapp/src backend-telefonico/src

Aislamiento de Fallos entre Canales (Resiliencia)Demuestra que la caída de un canal específico no afecta la disponibilidad ni la persistencia de los restantes:PowerShell# 1. Simular caída del canal WhatsApp

Verificar que el canal Web continúa operando normalmente (201 Created)

Invoke-RestMethod -Method Post -Uri "http://localhost/api/v1/web/tramites" `
  -Headers @{ Authorization = "Bearer $tokenVecino" } `
  -ContentType "application/json" `
  -Body $bodyTramite

Restaurar el servicio WhatsApp

docker compose start backend-whatsapp
Resultado observado: Ante la detención de backend-whatsapp, el API Gateway aísla el fallo (502 Bad Gateway únicamente en /api/v1/whatsapp/*) mientras los canales /api/v1/web/* y /api/v1/telefonico/* continúan operando sin degradación.
