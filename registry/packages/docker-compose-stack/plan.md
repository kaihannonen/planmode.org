# Docker Compose Production Stack

Set up a production-ready Docker Compose stack with Nginx reverse proxy, your application server, and a {{db_type}} database.

## Prerequisites

- Docker and Docker Compose installed
- An application with a Dockerfile (or ready to create one)

## Steps

### 1. Create the project structure

```
project/
├── docker-compose.yml
├── docker-compose.prod.yml
├── Dockerfile
├── nginx/
│   ├── nginx.conf
│   └── conf.d/
│       └── default.conf
└── .env.docker
```

### 2. Create the application Dockerfile

Create `Dockerfile` in the project root:

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --only=production

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
USER appuser
EXPOSE {{app_port}}
CMD ["node", "dist/index.js"]
```

### 3. Create the Docker Compose file

Create `docker-compose.yml`:

```yaml
version: "3.9"

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "{{app_port}}:{{app_port}}"
    environment:
      - NODE_ENV=production
{{#if (eq db_type "postgres")}}
      - DATABASE_URL=postgresql://app:secret@db:5432/appdb
{{/if}}
{{#if (eq db_type "mysql")}}
      - DATABASE_URL=mysql://app:secret@db:3306/appdb
{{/if}}
{{#if (eq db_type "mongodb")}}
      - DATABASE_URL=mongodb://app:secret@db:27017/appdb
{{/if}}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - app-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
    depends_on:
      - app
    restart: unless-stopped
    networks:
      - app-network

{{#if (eq db_type "postgres")}}
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: appdb
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d appdb"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - app-network
{{/if}}
{{#if (eq db_type "mysql")}}
  db:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: rootsecret
      MYSQL_USER: app
      MYSQL_PASSWORD: secret
      MYSQL_DATABASE: appdb
    volumes:
      - db-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - app-network
{{/if}}
{{#if (eq db_type "mongodb")}}
  db:
    image: mongo:7
    environment:
      MONGO_INITDB_ROOT_USERNAME: app
      MONGO_INITDB_ROOT_PASSWORD: secret
      MONGO_INITDB_DATABASE: appdb
    volumes:
      - db-data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - app-network
{{/if}}

volumes:
  db-data:

networks:
  app-network:
    driver: bridge
```

### 4. Configure Nginx

Create `nginx/nginx.conf`:

```nginx
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;

    include /etc/nginx/conf.d/*.conf;
}
```

Create `nginx/conf.d/default.conf`:

```nginx
upstream app_server {
    server app:{{app_port}};
}

server {
    listen 80;
    server_name _;

    client_max_body_size 10M;

    location / {
        proxy_pass http://app_server;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        access_log off;
        proxy_pass http://app_server/health;
    }
}
```

### 5. Create a .env.docker file

```
COMPOSE_PROJECT_NAME=myapp
NODE_ENV=production
APP_PORT={{app_port}}
```

### 6. Add a .dockerignore file

```
node_modules
.git
.env
.env.local
*.md
docker-compose*.yml
```

### 7. Build and run

```bash
# Build and start all services
docker compose up -d --build

# Check running containers
docker compose ps

# View logs
docker compose logs -f app

# Stop all services
docker compose down

# Stop and remove volumes (destroys data)
docker compose down -v
```

### 8. Verify the stack

```bash
# Check the app is running behind Nginx
curl http://localhost

# Check database connectivity
docker compose exec db {{#if (eq db_type "postgres")}}psql -U app -d appdb -c "SELECT 1"{{/if}}{{#if (eq db_type "mysql")}}mysql -u app -psecret appdb -e "SELECT 1"{{/if}}{{#if (eq db_type "mongodb")}}mongosh --username app --password secret --authenticationDatabase admin appdb --eval "db.runCommand({ ping: 1 })"{{/if}}
```

## What you get

- Multi-stage Docker build for minimal image size
- Nginx reverse proxy with gzip compression
- {{db_type}} database with persistent volume
- Health checks for service dependencies
- Bridge network for service isolation
- Production-ready restart policies
