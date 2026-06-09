# Bruma API Server

Express API + WebSocket server for Bruma POS system.

## Setup

```bash
cd api-server
npm install
cp .env.example .env
# Edit .env with your DATABASE_URL
```

## Development

```bash
npm run dev
```

Server runs on `http://localhost:4000`

## Production

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t bruma-api-server .
docker run -p 4000:4000 --env-file .env bruma-api-server
```

## WebSocket Rooms

Clients should join rooms after connecting:

- `room:dispatch` — Kitchen/dispatch screens
- `room:pos` — POS terminals
- `room:waitress` — Waitress tablets
- `room:tables` — Table management views

Example (Socket.io client):
```javascript
socket.emit('join', 'room:pos');
```

## Events

### Server → Client

- `order:new` → New order created
- `order:updated` → Order status changed
- `order:paid` → Order paid
- `order:items_ready` → Batch of items marked ready
- `table:updated` → Table status changed
- `cash_register:opened` → Cash register opened
- `cash_register:closed` → Cash register closed
- `stock:updated` — Inventory updated
- `delivery:new_order` — New delivery platform order

## API Endpoints

See `/health` for server status.

Full API documentation coming soon.
