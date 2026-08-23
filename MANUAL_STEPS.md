# Bruma Comandas — pasos manuales en Xcode

Esto es lo único que yo no puedo hacer por ti: crear el target nuevo dentro de
`Bruma POS.xcodeproj` y conectarle los archivos compartidos. Una vez hecho esto,
yo dejo todo el código listo dentro de la carpeta que Xcode crea automáticamente.

## Fase 0 — Crear el target (antes de que yo entregue el código)

1. Abre `Bruma POS.xcodeproj` en Xcode.
2. **File → New → Target…** → elige **iOS → App** → Next.
3. Llena el formulario así (importante, para que las rutas coincidan con lo que
   yo voy a escribir):
   - **Product Name**: `Bruma Comandas` (exacto, con ese espacio y mayúsculas —
     Xcode va a crear una carpeta `Bruma Comandas/` junto a `Bruma POS/`, y ahí
     es donde yo voy a poner mis archivos).
   - **Team**: el mismo que usa "Bruma POS" (P4XK9MB8P5, o el que tengas activo).
   - **Organization Identifier**: el mismo que usa "Bruma POS" (`com.cocinabruma`).
   - **Interface**: SwiftUI.
   - **Language**: Swift.
   - Deja **Include Tests** desmarcado (POS tampoco lo usa).
4. Click **Finish**. Xcode crea el target nuevo, un esquema nuevo, y una carpeta
   `Bruma Comandas/` con un `ComandasApp.swift`/`ContentView.swift` placeholder
   — **no los borres todavía**, yo los voy a reemplazar directo por el código
   real en el siguiente paso (fuera de Xcode, editando los archivos).

## Compartir los archivos reales de POS con el target nuevo

Esto es lo que hace que "Bruma POS Mobile" use el código real de POS sin copiar
nada — el mismo archivo, compilado en los dos targets.

5. En el **Project Navigator** (panel izquierdo), dentro de la carpeta
   `Bruma POS/`, selecciona estos archivos/carpetas (⌘-click para multi-selección):
   - `ViewModels/POSViewModel.swift`
   - Toda la carpeta `Models/`
   - Toda la carpeta `Services/`
   - Toda la carpeta `Styles/`
   - `Config/Environment.swift`
6. Con todo eso seleccionado, abre el **File Inspector** (⌥⌘1, el ícono de la
   hoja de papel en el panel derecho).
7. Busca la sección **Target Membership** — vas a ver una casilla marcada solo
   para "Bruma POS". **Marca también la casilla de "Bruma POS Mobile"** (deja la
   de "Bruma POS" marcada también — no la quites, ambos targets deben seguir
   compilando estos archivos).
8. Repite esto para cualquier archivo nuevo que yo agregue después a esas
   mismas carpetas compartidas (Models/Services/Styles) — cuando yo cree un
   archivo ahí, avísame y te digo cuál es, para que le actives la casilla del
   target nuevo (yo no puedo hacer esto desde fuera de Xcode).

## Dependencias de paquetes (SocketIO, QRCode)

9. Selecciona el proyecto `Bruma POS` en la barra superior del Project
   Navigator → pestaña **"Bruma POS Mobile"** (el target nuevo) → **General** →
   sección **"Frameworks, Libraries, and Embedded Content"**.
10. Click **+** → busca **SocketIO** → Add. Repite para **QRCode**.
    (Son los mismos paquetes que ya usa "Bruma POS" — sin esto, `SocketService`
    y el escáner de lealtad no van a compilar en el target nuevo.)

## Info.plist e identidad de la app nueva

11. Selecciona el target "Bruma POS Mobile" → pestaña **Info** → confirma que
    tiene su propio `Info.plist` (Xcode ya lo crea automático). Ábrelo y
    agrega las mismas dos llaves que tiene `Bruma-POS-Info.plist`:
    - `NSAppTransportSecurity` → `NSAllowsArbitraryLoads` = `YES`
    - `NSCameraUsageDescription` = "Se necesita acceso a la cámara para
      escanear códigos QR de las tarjetas de lealtad."
12. Pestaña **Signing & Capabilities** del target nuevo → confirma
    **Automatically manage signing** con el mismo Team.
13. Pestaña **Build Settings** del target nuevo:
    - `TARGETED_DEVICE_FAMILY` → cámbialo a `1` (solo iPhone — hoy Xcode lo
      pone en `1,2` por default).
    - `PRODUCT_BUNDLE_IDENTIFIER` → confirma que sea algo distinto a
      `com.cocinabruma.Bruma-POS`, p.ej. `com.cocinabruma.Bruma-Comandas`
      (Xcode normalmente ya lo genera distinto solo).

## Avísame cuando termines esto

En cuanto tengas el target creado y los archivos compartidos con la casilla
marcada, dime y yo te dejo todo el código de las vistas nuevas listo dentro de
`Bruma Comandas/` — ahí sí ya solo tienes que compilar y correr en tu iPhone.

---

# Fase 5 — TestFlight (para cuando el código ya esté probado)

1. **App Store Connect** (appstoreconnect.apple.com) → Apps → **+** → New App
   → llena bundle ID (`com.cocinabruma.Bruma-Comandas`), nombre visible
   ("Bruma POS Mobile" o el que prefieras), idioma principal.
2. Diseña/consigue un ícono 1024×1024 para la app nueva (distinto al de POS,
   para que se distinga en la pantalla de inicio del celular) y agrégalo en
   Xcode: target "Bruma POS Mobile" → pestaña **General** → **App Icon**, o en
   `Assets.xcassets` dentro de la carpeta `Bruma Comandas/`.
3. En Xcode: selecciona el esquema "Bruma POS Mobile" (arriba, junto al botón de
   Play) → **Product → Archive**.
4. Cuando termine el archive, en el Organizer que se abre → **Distribute App**
   → **App Store Connect** → sigue el asistente (mismo flujo que ya usas para
   subir Bruma POS/Bruma_waitress).
5. En App Store Connect → tu app nueva → **TestFlight** → agrega a los
   testers (tu equipo de meseros) al build recién subido.
