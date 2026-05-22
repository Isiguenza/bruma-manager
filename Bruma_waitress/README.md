# Bruma Waitress

App de SwiftUI para meseras — tomar pedidos y enviar a cocina desde el iPhone.

## Configuración en Xcode (obligatorio antes de compilar)

### 1. App Transport Security (ATS)

La app se conecta al servidor POS por HTTP en red local. Necesitas permitirlo:

1. Abre el proyecto en Xcode
2. Selecciona el target **Bruma_waitress**
3. Ve a la pestaña **Info**
4. En **Custom iOS Target Properties**, agrega:

| Key | Type | Value |
|---|---|---|
| `App Transport Security Settings` | Dictionary | |
| ↳ `Allow Arbitrary Loads` | Boolean | `YES` |
| ↳ `Allows Local Networking` | Boolean | `YES` |
| `Privacy - Local Network Usage Description` | String | `Bruma Waitress necesita acceso a la red local para conectarse al servidor POS.` |

### 2. IP del Servidor

Edita `Services/APIService.swift` y cambia las IPs:

```swift
var baseURL: String = "http://192.168.0.152:3000"      // IP de tu servidor POS
var printServerURL: String = "http://192.168.0.152:3001" // IP del print server
```

### 3. Deployment Target

El proyecto usa Xcode 26 / iOS 26.2 por default. Si quieres soportar iPhones más viejos:

1. Target → **General** → **Minimum Deployments** → cambia a **iOS 17.0** (o lo que necesites)

## Estructura

```
Bruma_waitress/
├── Models/           — Tipos de datos (Product, Table, Order, CartItem, etc.)
├── Services/         — APIService (networking centralizado)
├── ViewModels/       — Lógica de negocio (Auth, Tables, Menu, Cart, Orders)
└── Views/
    ├── Auth/         — Login con código de empleado + PIN
    ├── Tables/       — Selección de mesa / Para Llevar
    ├── Menu/         — Catálogo de productos, variantes, modificadores
    ├── Cart/         — Carrito con asientos y tiempos
    └── Orders/       — Órdenes activas con estado en tiempo real
```

## Flujo de la app

1. **Login** — Código de empleado (6 dígitos) + PIN (4 dígitos)
2. **Seleccionar mesa** — Grid de mesas o "Para Llevar"
3. **Agregar productos** — Buscar, elegir categoría, seleccionar variantes/modificadores
4. **Carrito** — Asignar asientos (A1, A2...), tiempos (T1, T2...), agregar notas
5. **Enviar a Cocina** — Crea/actualiza la orden + imprime comanda en cocina
6. **Órdenes activas** — Ver estado de las órdenes (preparando → listo)

## API Endpoints

La app usa los mismos endpoints que `/bar`:

- `POST /api/employees/verify-pin` — Auth
- `GET /api/cash-register/current` — Verificar caja abierta
- `GET /api/tables` — Mesas
- `GET /api/products?active=true` — Productos
- `GET /api/categories` — Categorías
- `GET /api/categories/{id}/flow` — Flujo de modificadores
- `POST /api/orders` — Crear orden
- `POST /api/orders/{id}/items` — Agregar items
- `GET /api/orders?status=preparing` — Órdenes activas
- `PUT /api/tables/{id}` — Actualizar estado de mesa
- `POST print-server:3001/print-comanda` — Imprimir comanda
