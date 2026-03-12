# 🌐 NexLink — Social Communication Platform

A full-stack social platform with real-time chat, calls, location sharing, and web search.  
Built with **Node.js + Express**, **PostgreSQL (RDS-compatible)**, **Docker**, and a beautiful dark-themed frontend.

---

## 📁 Project Structure

```
nexlink/
├── frontend/
│   └── index.html          ← Full SPA (auth, chat, calls, location, search)
├── backend/
│   ├── server.js           ← Express app entry point
│   ├── package.json
│   ├── routes/
│   │   ├── auth.js         ← Signup, Login, Logout, Permissions
│   │   └── users.js        ← Contacts, Messages, Calls, Location
│   ├── middleware/
│   │   └── auth.js         ← JWT authentication middleware
│   └── db/
│       ├── index.js        ← PostgreSQL pool + migration runner
│       └── schema.sql      ← Full DB schema (RDS compatible)
├── nginx/
│   └── nginx.conf          ← Reverse proxy config
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🚀 Quick Start (Docker — Recommended)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Git](https://git-scm.com/)

### 1. Clone & configure
```bash
git clone <your-repo-url>
cd nexlink
cp .env.example .env
# Edit .env with your values (especially JWT_SECRET and DB_PASSWORD)
```

### 2. Start everything
```bash
docker-compose up --build
```

### 3. Open the app
```
http://localhost:80
```

---

## 💻 Local Development (GitHub Codespaces / VS Code)

### Prerequisites
- Node.js 20+
- PostgreSQL (local or Docker)

### 1. Start PostgreSQL with Docker
```bash
docker run -d \
  --name nexlink_postgres \
  -e POSTGRES_DB=nexlink \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=nexlink_pass \
  -p 5432:5432 \
  postgres:15-alpine
```

### 2. Setup backend
```bash
cd backend
npm install
cp ../.env.example ../.env   # edit .env as needed
```

### 3. Run database migration
```bash
# In .env, make sure DB_HOST=localhost
node -e "require('./db').migrate().then(()=>process.exit(0))"
```

### 4. Start the server
```bash
npm run dev        # development with hot reload
# or
npm start          # production
```

### 5. Open the app
```
http://localhost:3001
```

---

## 🗄️ Azure Data Studio — Connect to Database

1. Open **Azure Data Studio**
2. Click **New Connection**
3. Fill in:
   | Field      | Value                        |
   |------------|------------------------------|
   | Server     | `localhost`                  |
   | Port       | `5432`                       |
   | Database   | `nexlink`                    |
   | User name  | `postgres`                   |
   | Password   | *(your DB_PASSWORD)*         |
   | SSL Mode   | Disable (local) / Require (RDS) |

4. Click **Connect** ✅

You can now run queries, browse tables, and inspect data directly.

---

## ☁️ AWS RDS Setup

### 1. Create RDS PostgreSQL instance
- Engine: PostgreSQL 15
- DB instance identifier: `nexlink-prod`
- Master username: `nexlink_admin`
- Set a strong password
- Enable public access: Yes (dev) / No (prod with VPC)
- Initial database name: `nexlink`

### 2. Update your .env
```env
DB_HOST=your-instance.xxxxx.us-east-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=nexlink
DB_USER=nexlink_admin
DB_PASSWORD=YourRDSPassword
DB_SSL=true
```

### 3. Run schema on RDS
```bash
psql -h your-rds-host -U nexlink_admin -d nexlink -f backend/db/schema.sql
```

### 4. Connect Azure Data Studio to RDS
Same steps as above, but use your RDS endpoint as the server and set SSL to `Require`.

---

## 🐳 Docker Commands Reference

```bash
# Start all services
docker-compose up --build

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f app
docker-compose logs -f postgres

# Stop all
docker-compose down

# Stop and remove volumes (⚠️ deletes DB data)
docker-compose down -v

# Rebuild just the app
docker-compose up --build app

# Shell into postgres container
docker exec -it nexlink_postgres psql -U postgres -d nexlink

# Shell into app container
docker exec -it nexlink_app sh
```

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET  | `/api/auth/me` | Get current user |
| POST | `/api/auth/permissions` | Save device permissions |

### Users & Social
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/search?q=name` | Search users |
| GET | `/api/users/contacts` | Get connections |
| POST | `/api/users/connect` | Add connection |
| GET | `/api/users/messages/:userId` | Get chat messages |
| POST | `/api/users/messages` | Send message |
| POST | `/api/users/calls/log` | Log a call |
| GET | `/api/users/calls/history` | Call history |
| POST | `/api/users/location/share` | Share location |
| GET | `/api/users/location/shared-with-me` | View shared locations |
| PATCH | `/api/users/profile` | Update profile |

---

## ✨ Features

- 🔐 **Secure Auth** — Signup/Login with password hashing (bcrypt), JWT sessions, optional 4-digit PIN
- 💬 **Real-time Chat** — Direct messaging between connections (polls every 5s)
- 📞 **Calls** — Voice/video call UI with timer, mute, and video toggle
- 📍 **Location Sharing** — Share your GPS location to set meeting points, with Google Maps embed
- 🔍 **Web Search** — Google redirect + YouTube embedded search
- 🔔 **Permissions Popup** — Camera, location, and call access on first login
- 🐳 **Docker Ready** — One command to run everything
- 🏗️ **RDS Compatible** — Drop-in replacement for local PostgreSQL

---

## 🔒 Security Notes

- Change `JWT_SECRET` to a long random string in production
- Change `DB_PASSWORD` to a strong password
- Enable SSL (`DB_SSL=true`) for RDS in production
- Configure firewall rules for RDS (allow only your app's IP)
- The nginx config includes rate limiting for auth endpoints

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS, Font Awesome, Google Fonts |
| Backend | Node.js, Express.js |
| Database | PostgreSQL 15 (AWS RDS compatible) |
| Auth | JWT + bcrypt + session table |
| Container | Docker + Docker Compose |
| Proxy | Nginx |
| DB GUI | Azure Data Studio |
