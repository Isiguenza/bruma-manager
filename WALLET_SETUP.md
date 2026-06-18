# Configuracion de Notificaciones Push — Apple & Google Wallet

Este documento explica paso a paso como obtener las credenciales necesarias para que los sellos de lealtad se actualicen en tiempo real en Apple Wallet y Google Wallet.

---

## 1. Apple Push Notifications (APN)

Cuando agregas un sello desde el POS o el Dashboard, se envia un push a los iPhones registrados para que Apple Wallet descargue el pass actualizado inmediatamente.

### Que necesitas

| Campo | Descripcion |
|---|---|
| `APPLE_APN_KEY_ID` | Identificador de la llave APNs (10 caracteres) |
| `APPLE_APN_TEAM_ID` | Tu Apple Team ID (10 caracteres) |
| `APPLE_APN_PRIVATE_KEY` | Contenido del archivo `.p8` de APNs |

### Pasos para obtenerlos

1. **Apple Developer Portal** → [developer.apple.com](https://developer.apple.com)
2. Ve a **Account** → **Certificates, IDs & Profiles**
3. En el menu lateral, selecciona **Keys** (no Certificates)
4. Click en el boton **+** para crear una nueva llave
5. **Key Name**: escribe algo como "Bruma APN"
6. **Services**: marca la casilla **Apple Push Notifications service (APNs)**
7. Click **Continue** → **Register**
8. Descarga el archivo `.p8` — **solo se puede descargar una vez, guardalo bien**
9. Anota el **Key ID** (aparece al lado del nombre de la llave, ej. `K9KQT7A5JS`)
10. Tu **Team ID** esta en la esquina superior derecha de la pagina (o en Membership Details) (P4XK9MB8P5)




### Formato para el .env

```env
APPLE_APN_KEY_ID=ABCD1234EF
APPLE_APN_TEAM_ID=TEAMID1234
APPLE_APN_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----\nMHQCAQEEI...\n...\n-----END EC PRIVATE KEY-----"
```

> El archivo `.p8` es un texto plano. Copia todo el contenido (incluyendo los `-----BEGIN/END-----`) en una sola linea con `\n` como saltos de linea, o guaradalo directamente en una variable de entorno multilinea.

---

## 2. Google Wallet

Google Wallet no tiene push nativo como Apple, pero al actualizar el objecto via API, la tarjeta se refresca automaticamente en el dispositivo del cliente.

### Que necesitas

| Campo | Descripcion |
|---|---|
| `GOOGLE_WALLET_ISSUER_ID` | ID del emisor en Google Pay & Wallet Console |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_KEY` | JSON completo de la cuenta de servicio |

### Pasos para obtenerlos

#### 2.1 Crear el proyecto en Google Cloud

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Selecciona o crea un proyecto nuevo
3. Ve a **APIs & Services** → **Library**
4. Busca **Google Wallet API** y habilitala

#### 2.2 Crear la cuenta de servicio

1. Ve a **IAM & Admin** → **Service Accounts**
2. Click **+ Create Service Account**
3. **Name**: `bruma-wallet-service`
4. Click **Create and Continue**
5. En **Grant access**, asigna el rol: **Wallet API User**
6. Click **Done**
7. Dentro de la cuenta creada, ve a la pestana **Keys**
8. Click **Add Key** → **Create New Key**
9. Selecciona **JSON** y descarga el archivo

#### 2.3 Obtener el Issuer ID

1. Ve a [Google Pay & Wallet Console](https://pay.google.com/gp/w/homepage)
2. El **Issuer ID** aparece en la pagina principal (arriba a la derecha o en Account Info)
3. Es un numero largo como `3388000000023159569` (tu ID)
4. Si ya aparece, anotalo y salta a crear la clase (paso 2.4)
5. Si no aparece, crea una clase primero y se generara automaticamente

#### 2.4 Crear la clase de pass (loyalty)

1. En Google Pay & Wallet Console, ve a **Classes**
2. Click **Create Class** → **Loyalty**
3. **Class Name**: `loyalty.bruma` (exactamente este nombre)
4. **Issuer ID**: `3388000000023159569` (el tuyo)
5. **ID de la clase completo**: `3388000000023159569.loyalty.bruma`
6. Rellena **todos** estos campos (son obligatorios para poder guardar):
   - **Program Name**: `Espantapajaros Rewards`
   - **Issuer Name**: `Espantapajaros`
   - **Review Status**: Selecciona una opcion (ej. `approved`)
   - **Program Logo**: Sube cualquier imagen cuadrada (min 48x48px, PNG/JPG)
   - **Hero Image**: Sube cualquier imagen rectangular (min 1032x660px) o la misma del logo
   - **Primary Color**: `#1D3B1F` (verde oscuro)
   - **Secondary Color**: `#C8A456` (dorado)
   - **Hex Background Color**: `#1D3B1F`
   - **Hex Foreground Color**: `#FFFFFF`
7. Si sigue sin dejarte guardar, revisa la pestana **Review** y llena:
   - **Program Description**: breve descripcion del programa de lealtad
   - **Program Website**: tu URL (`https://espantapajaros.com`)
   - **Contact Information**: email de soporte
8. Guarda

### Formato para el .env

```env

```

> El JSON de la cuenta de servicio debe ir en una sola linea entre comillas simples, o guardado como variable de entorno multilinea.

---

## 3. Variables de entorno finales (.env)

Una vez tengas todo, tu `.env` debe incluir:

```env

```

---

## 4. Que pasa despues

Cuando tengas las credenciales, avisanos y hacemos:

1. Implementar `lib/apple-push.ts` — envia push APN al agregar sellos
2. Implementar `lib/google-wallet.ts` — actualiza objects de Google Wallet
3. Conectar ambos en `POST /api/loyalty/[id]/stamps` para que funcione desde:
   - Bruma POS (iPad)
   - Dashboard web (manual)
4. Dashboard: boton "Google Wallet" junto al de Apple Wallet
5. Dashboard: seccion "Notificaciones" para enviar mensajes de marketing

---

## Notas importantes

- **Apple APN push funciona en produccion** (con certificado real). En desarrollo local puede no llegar.
- El archivo `.p8` de Apple **solo se descarga una vez**. Si lo pierdes, debes crear una nueva llave.
- Google Wallet se actualiza silenciosamente en el dispositivo (sin notificacion en pantalla) al cambiar el objecto.
- Las notificaciones de marketing personalizadas solo funcionan en Apple Wallet (push nativo). En Google Wallet se muestran como texto dentro del pass.
