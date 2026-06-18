# Espantapájaros POS — Guía de Configuración

## 1. Requisitos Previos

- **Node.js** 18+ y **pnpm** instalados
- Cuenta en [Neon](https://neon.tech) (base de datos + auth)
- Cuenta de [Mercado Pago](https://www.mercadopago.com.mx/developers) (para terminal de cobro)
- Cuenta de [Apple Developer](https://developer.apple.com) (para Apple Wallet passes — opcional)

---

## 2. Configurar NeonDB

1. Crea un proyecto en [Neon Console](https://console.neon.tech)
2. Copia la **Connection String** de tu base de datos (formato `postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require`)
3. Pégala como `DATABASE_URL` en tu archivo `.env`

### Crear las tablas

```bash
# Opción 1: Push directo (desarrollo)
pnpm db:push

# Opción 2: Generar migración SQL
pnpm db:generate
pnpm db:migrate
```

### Explorar la base de datos

```bash
pnpm db:studio
```

---

## 3. Configurar Neon Auth

1. En Neon Console, ve a tu proyecto → Branch → **Auth**
2. Haz clic en **Enable Auth**
3. Copia la **Auth URL** (formato `https://ep-xxx.neonauth.us-east-1.aws.neon.tech/neondb/auth`)
4. Genera un cookie secret:

```bash
openssl rand -base64 32
```

5. Agrega al `.env`:

```env
NEON_AUTH_BASE_URL=https://ep-xxx.neonauth.us-east-1.aws.neon.tech/neondb/auth
NEON_AUTH_COOKIE_SECRET=tu-secret-generado
```

6. (Opcional) En la configuración de Auth en Neon Console puedes habilitar proveedores sociales como Google.

---

## 4. Configurar Mercado Pago

### 4.1 Obtener Access Token

1. Ve a [Mercado Pago Developers](https://www.mercadopago.com.mx/developers/panel/app)
2. Crea una aplicación o usa una existente
3. Ve a **Credenciales** → copia el **Access Token** de producción (o sandbox para pruebas)
4. Agrega al `.env`:

```env
MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxx
```

### 4.2 Vincular Terminal Point Smart

1. Descarga la app **Mercado Pago** en tu terminal Point Smart
2. Inicia sesión con la misma cuenta de Mercado Pago
3. En la app de developers, ve a **Integraciones** → **Punto de Venta**
4. Obtén el `device_id` de tu terminal desde la API:

```bash
curl -X GET \
  'https://api.mercadopago.com/point/integration-api/devices' \
  -H 'Authorization: Bearer TU_ACCESS_TOKEN'
```

5. Registra el dispositivo en el POS desde la base de datos o crea un endpoint admin.

### 4.3 Configurar Webhook

1. En Mercado Pago Developers → tu app → **Webhooks**
2. Agrega la URL: `https://tu-dominio.com/api/mercadopago/webhook`
3. Selecciona los eventos: **Payments**, **Point Integration**
4. Guarda el **secret** del webhook:

```env
MERCADOPAGO_WEBHOOK_SECRET=tu-webhook-secret
```

---

## 5. Configurar Apple Wallet (Tarjeta de Cliente Frecuente)

### 5.1 Obtener Certificados

1. En [Apple Developer](https://developer.apple.com/account/resources/identifiers/list/passTypeId):
   - Crea un **Pass Type ID** (ej: `pass.com.bruma.loyalty`)
   - Descarga el certificado `.cer`

2. Instala el `.cer` en tu Mac (doble click). Luego exporta como `.p12` desde **Keychain Access**:
   - Busca el certificado de `pass.com.bruma.loyalty`
   - Click derecho → **Exportar** → selecciona formato `.p12`
   - Guarda como `certificate.p12` (pon una contrasena si te la pide)

3. Convierte el `.p12` a los archivos `.pem` separados:

```bash
# Crea la carpeta certs si no existe
mkdir -p certs

# Extrae el certificado (sin llave privada)
# Si te da error de RC2-40-CBC, usa -legacy:
openssl pkcs12 -in certificate.p12 -clcerts -nokeys -out certs/signerCert.pem -legacy

# Extrae la llave privada (te pedira la contrasena del .p12)
openssl pkcs12 -in certificate.p12 -nocerts -out certs/signerKey.pem -legacy
```

3. Descarga el certificado **WWDR (Apple Worldwide Developer Relations)**:

```bash
curl -o certs/wwdr.pem https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
# Convierte a PEM si es necesario
openssl x509 -inform DER -in certs/wwdr.pem -out certs/wwdr.pem
```

4. Coloca los 3 archivos en la carpeta `certs/` del proyecto:
   - `certs/wwdr.pem`
   - `certs/signerCert.pem`
   - `certs/signerKey.pem`

5. Agrega al `.env`:

```env
APPLE_PASS_TYPE_ID=pass.com.bruma.loyalty
APPLE_TEAM_ID=TU_TEAM_ID
```

> **Nota:** Sin estos certificados, el sistema funciona completamente excepto la generación del archivo `.pkpass`. La tarjeta de lealtad sigue funcionando con el código de barras interno.

---

## 6. Variables de Entorno Completas

Crea un archivo `.env` basado en `.env.example`:

```bash
cp .env.example .env
```

Edita `.env` con tus valores reales.

---

## 7. Iniciar el Proyecto

```bash
# Instalar dependencias
pnpm install

# Crear tablas en la base de datos
pnpm db:push

# Iniciar servidor de desarrollo
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

> **iPad:** Para usar en iPad, asegúrate de que tu computadora y el iPad estén en la misma red. Accede usando la IP local (ej: `http://192.168.1.100:3000`).

---

## 8. Primer Uso

1. **Regístrate** en `/auth/sign-up` con tu email
2. Ve a **Inventario → Productos** y crea tus categorías y productos
3. (Opcional) Ve a **Inventario → Ingredientes** y registra ingredientes con recetas
4. Abre la **Caja Registradora** con un monto inicial
5. ¡Comienza a tomar órdenes en **Nueva Orden**!

---

## 9. Estructura del Proyecto

```
app/
├── (dashboard)/          # Layout con sidebar
│   ├── dashboard/        # Dashboard principal
│   ├── orders/
│   │   ├── new/          # Tomar orden
│   │   ├── pay/[id]/     # Cobrar orden
│   │   ├── dispatch/     # Despacho
│   │   └── history/      # Historial
│   ├── inventory/
│   │   ├── products/     # CRUD productos
│   │   └── ingredients/  # CRUD ingredientes
│   ├── cash-register/    # Caja registradora
│   │   └── history/      # Historial de cortes
│   └── loyalty/          # Tarjetas de cliente frecuente
├── auth/[path]/          # Auth pages (Neon Auth)
├── account/[path]/       # Account settings
└── api/                  # API Routes
    ├── products/
    ├── categories/
    ├── ingredients/
    ├── orders/
    ├── cash-register/
    ├── loyalty/
    ├── dashboard/
    ├── mercadopago/webhook/
    └── wallet/pass/[id]/
lib/
├── db/
│   ├── schema.ts         # Drizzle schema
│   └── index.ts          # DB connection
├── auth/
│   ├── server.ts         # Neon Auth server
│   └── client.ts         # Neon Auth client
├── types.ts              # TypeScript types
└── utils.ts              # Utilities
```
