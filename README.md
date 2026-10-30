# order-api

API de ordenes de marketplaces construida con NestJS.

## Local

### Requisitos

- Node.js 20
- npm
- acceso de red a marketplace-api y madre-api
- archivo `.env` con:

```env
MARKETPLACE_API_BASE_URL=<url de marketplace-api>
MADRE_API_BASE_URL=<url de madre-api>
# URL completa de VBI (Azure external-sale-create) con ?code=... No commitear el valor.
# Vacia: el envio a VBI falla y las ordenes quedan FAILED [VBI_ERROR].
POWERAPPS_API_URL=
# Crons (hora de Argentina). Expresion con segundos: "seg min hora dia mes diaSemana".
# Sin valor usan el horario por defecto; si la expresion es invalida se loguea un error y tambien.
# Los comentarios van en su propia linea: el .env no admite comentarios al final del valor.
# Por defecto: cada 2 horas en punto
ORDERS_SYNC_CRON=0 0 */2 * * *
# Por defecto: cada hora a los :30
ORDERS_STATUS_CRON=0 30 * * * *
# Header x-api-key que exigen los POST /orders/fravega/* (en Swagger: boton Authorize).
# Las consultas GET (las que usa panel.market) no la piden. Sin valor los POST responden 500.
# Los crons no la necesitan.
API_KEY=
# false: no corre ese cron (los endpoints manuales siguen andando). Sin valor corren.
ORDERS_SYNC_CRON_ENABLED=false
ORDERS_STATUS_CRON_ENABLED=false
# Dias desde la compra en los que el proceso de estados sigue revisando una orden. Sin valor: 60.
ORDERS_STATUS_MAX_AGE_DAYS=60
```

### Flujo de ordenes (cron `ORDERS_SYNC_CRON`, por defecto cada 2 horas, o `POST /orders/fravega/sync`)

`persistence_status` en madre sigue el estado de la orden en Fravega: `PENDING` mientras esta abierta,
`COMPLETED` cuando se entrega y `CANCELLED` cuando se cancela o se devuelve. El resultado de VBI va en
`notification_system_b_status`, `floxu_code` (numero TLQV), `vbi_sale_id` y `vbi_nro_venta`.

1. Trae las ordenes nuevas de Fravega desde marketplace-api (`/fravega/full-orders`), desde el ultimo sync.
2. Las que ya existen en madre se saltean.
3. Si ya esta cancelada o devuelta en Fravega no se envia a VBI: queda `CANCELLED` con el detalle en `last_error`.
4. Si falta el CUIL o el email del comprador queda `FAILED` con `last_error` `[MISSING_DATA] ...`.
5. La envia a VBI: si responde `success` (o `duplicate`) queda `PENDING` (o `COMPLETED` si ya fue entregada),
   con `notification_system_b_status: success`. Si no, `FAILED` con `[VBI_ERROR] ...`.
6. Las ordenes que marketplace-api no pudo completar (falla VTEX / Seller Central) quedan `FAILED` con `[SOURCE_ERROR] ...`.
7. Recien ahi la inserta en madre, en un solo batch con el resultado.

Si VBI la acepto pero madre no la pudo guardar, el sync automatico no avanza su marca y la vuelve a procesar:
VBI deduplica por `NROVENTA`, responde `duplicate` y se guarda sin crear otra venta.

Requiere la version de madre-api que acepta el resultado en el batch (`vbi_*`, `persistence_status`, `CANCELLED`)
y pagina `/pending`: con una version anterior madre descarta esos campos y las ordenes quedarian `PENDING` sin datos de VBI.
Deployar madre-api antes que orders-api.

- `POST /orders/fravega/sync?from=...&to=...` reprocesa un rango de fechas de compra a mano.
  `from` / `to` van en UTC. Seller Central filtra por la hora argentina de la compra (ignora la zona horaria),
  asi que orders-api le resta 3 horas al rango antes de pedirlo.
- `POST /orders/fravega/retry/{suborderId}` reintenta una orden `FAILED` (ej. `v93713051frvg-01`).

### Estados (cron `ORDERS_STATUS_CRON`, por defecto cada hora a los :30, o `POST /orders/fravega/status-sync`)

Recorre las ordenes `PENDING` de Fravega en madre (`GET /api/orders/pending`, de a 200), consulta cada una en Fravega y:

- entregada (`Delivered`) → `COMPLETED`;
- cancelada o devuelta (`Canceled` / `Returned` en Seller Central, o `canceled` en VTEX) → `CANCELLED`
  con el detalle en `last_error` (`[CANCELLED] ...`);
- el resto sigue `PENDING`.

En todas actualiza `status` y `delivery_status` si cambiaron en Fravega.

Solo revisa las compradas en los ultimos `ORDERS_STATUS_MAX_AGE_DAYS` dias (60 por defecto): una devolucion puede
llegar despues de facturar (hasta ~5 semanas despues de la compra), la entrega y los 10 dias de arrepentimiento.
Las mas viejas quedan `PENDING` sin revisar (en la respuesta, `tooOld`); se ven con `GET /api/orders` de madre.

Ademas completa el numero TLQV (`floxu_code`): VBI lo asigna despues de crear la venta, asi que en el primer
envio suele venir vacio. A las ordenes `PENDING` con `notification_system_b_status: success` y sin `floxu_code`
(salvo las canceladas) las reenvia a VBI: como VBI deduplica por `NROVENTA` responde `duplicate` con el numero,
sin crear otra venta.

Sync, retry y estados no corren en paralelo: si uno esta en curso, el otro responde 409 (o el cron se omite).

### Levantar en desarrollo

```bash
npm install
npm run start:dev
```

La API queda en:

- `http://localhost:3000`
- `http://localhost:3000/docs`

### Validaciones utiles

```bash
npm run lint
npm test -- --runInBand
npm run build
```

### Docker local

```bash
docker compose up --build
```

## Kubernetes

Los manifests viven en `k8s/`.

`POWERAPPS_API_URL` (lleva la clave de Azure, `?code=...`) y `API_KEY` no van en `config.yaml` sino en el Secret
`order-api-secrets`, que se crea una vez a mano en el cluster (no esta en el repo):

```bash
kubectl create secret generic order-api-secrets \
  --from-literal=POWERAPPS_API_URL='https://...azurewebsites.net/api/external-sale-create?code=...' \
  --from-literal=API_KEY='...'
kubectl rollout restart deployment/order-api   # para que el pod tome el valor
```

Mientras no exista, el pod arranca igual pero el envio a VBI falla (las ordenes quedan `FAILED [VBI_ERROR]`)
y los POST `/orders/fravega/*` responden 500. Los GET no usan la key.

Aplicacion manual:

```bash
kubectl apply -f k8s/config.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

## Deploy automatico a produccion

El repo queda preparado para deployar al hacer merge a `main` usando GitHub Actions:

1. Build multi-arch para `linux/amd64`
2. Push a DigitalOcean Container Registry
3. Actualizacion del `Deployment` en DOKS con la imagen taggeada por commit
4. Espera del rollout

### Secretos necesarios en GitHub

Configuralos en `Settings > Secrets and variables > Actions`:

- `DIGITALOCEAN_ACCESS_TOKEN`
- `DOCR_REGISTRY_NAME`
- `DO_KUBERNETES_CLUSTER_NAME`

### Requisitos de infraestructura

Antes de usar el workflow, el cluster debe estar integrado con el registry de DigitalOcean.

Segun la documentacion oficial de DigitalOcean, eso se puede hacer con:

```bash
doctl kubernetes cluster registry add <cluster-name>
```

Documentacion usada:

- [Enable Push-to-Deploy on DigitalOcean Kubernetes Using GitHub Actions](https://docs.digitalocean.com/products/container-registry/how-to/enable-push-to-deploy/)
- [How to Use Your Private DigitalOcean Container Registry with Docker and Kubernetes](https://docs.digitalocean.com/products/container-registry/how-to/use-registry-docker-kubernetes/)

### Lens

Los recursos de Kubernetes tienen labels `app.kubernetes.io/*` para que se vean mas ordenados en Lens:

- `app.kubernetes.io/name=order-api`
- `app.kubernetes.io/component=api`
- `app.kubernetes.io/part-of=order-api`

## Notas

- El workflow no aplica `k8s/cluster-issuer.yaml` en cada deploy porque es un recurso cluster-wide y conviene manejarlo aparte.
- El `Deployment` usa un placeholder `<IMAGE>` que el workflow reemplaza con la imagen exacta del commit antes de aplicar.
