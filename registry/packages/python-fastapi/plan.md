# Python FastAPI Project

Scaffold a production-ready FastAPI project with SQLAlchemy ORM, Alembic migrations, and Docker containerization.

## Prerequisites

- Python >= 3.11
- pip or uv package manager
- Docker (optional, for containerized development)

## Steps

### 1. Create the project structure

```bash
mkdir myapi && cd myapi

mkdir -p src/myapi/{api,core,models,schemas,services}
mkdir -p tests
mkdir -p alembic/versions
```

The target structure:

```
myapi/
├── src/
│   └── myapi/
│       ├── __init__.py
│       ├── main.py
│       ├── api/
│       │   ├── __init__.py
│       │   ├── deps.py
│       │   └── routes/
│       │       ├── __init__.py
│       │       ├── health.py
│       │       └── users.py
│       ├── core/
│       │   ├── __init__.py
│       │   ├── config.py
│       │   └── database.py
│       ├── models/
│       │   ├── __init__.py
│       │   └── user.py
│       ├── schemas/
│       │   ├── __init__.py
│       │   └── user.py
│       └── services/
│           ├── __init__.py
│           └── user.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   └── test_health.py
├── alembic/
│   ├── env.py
│   └── versions/
├── alembic.ini
├── pyproject.toml
├── Dockerfile
├── docker-compose.yml
└── .env
```

### 2. Set up the project with pyproject.toml

Create `pyproject.toml`:

```toml
[project]
name = "myapi"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.110.0",
    "uvicorn[standard]>=0.27.0",
    "sqlalchemy>=2.0.0",
    "asyncpg>=0.29.0",
    "alembic>=1.13.0",
    "pydantic-settings>=2.1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
    "httpx>=0.27.0",
    "ruff>=0.3.0",
    "mypy>=1.8.0",
]

[tool.ruff]
target-version = "py311"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP", "B", "SIM"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

### 3. Install dependencies

```bash
pip install -e ".[dev]"
```

### 4. Create the configuration module

Create `src/myapi/core/config.py`:

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "My API"
    debug: bool = False
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/mydb"
    allowed_origins: list[str] = ["http://localhost:3000"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
```

### 5. Set up the async database connection

Create `src/myapi/core/database.py`:

```python
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from myapi.core.config import settings

engine = create_async_engine(settings.database_url, echo=settings.debug)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

### 6. Define a model

Create `src/myapi/models/user.py`:

```python
from datetime import datetime
from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from myapi.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

### 7. Create Pydantic schemas

Create `src/myapi/schemas/user.py`:

```python
from datetime import datetime
from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    email: str
    name: str


class UserUpdate(BaseModel):
    email: str | None = None
    name: str | None = None


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

### 8. Create API routes

Create `src/myapi/api/routes/health.py`:

```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    return {"status": "healthy"}
```

Create `src/myapi/api/routes/users.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from myapi.core.database import get_db
from myapi.models.user import User
from myapi.schemas.user import UserCreate, UserResponse, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/", response_model=list[UserResponse])
async def list_users(skip: int = 0, limit: int = 20, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).offset(skip).limit(limit))
    return result.scalars().all()


@router.post("/", response_model=UserResponse, status_code=201)
async def create_user(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    user = User(**user_in.model_dump())
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(user_id: int, user_in: UserUpdate, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for field, value in user_in.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.flush()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
```

### 9. Create the FastAPI application

Create `src/myapi/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from myapi.core.config import settings
from myapi.api.routes import health, users

app = FastAPI(title=settings.app_name, debug=settings.debug)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(users.router, prefix="/api")
```

### 10. Initialize Alembic

```bash
alembic init alembic
```

Update `alembic/env.py` to use the async engine and import your models. Then create the first migration:

```bash
alembic revision --autogenerate -m "create users table"
alembic upgrade head
```

### 11. Create a Dockerfile

Create `Dockerfile`:

```dockerfile
FROM python:3.11-slim AS base
WORKDIR /app

FROM base AS deps
COPY pyproject.toml .
RUN pip install --no-cache-dir .

FROM deps AS app
COPY src/ src/
COPY alembic/ alembic/
COPY alembic.ini .
EXPOSE 8000
CMD ["uvicorn", "myapi.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 12. Run the application

```bash
# Development
uvicorn myapi.main:app --reload --port 8000

# The API docs are available at:
# http://localhost:8000/docs   (Swagger UI)
# http://localhost:8000/redoc  (ReDoc)
```

## What you get

- FastAPI application with async SQLAlchemy 2.0
- Pydantic v2 schemas for request/response validation
- Alembic for database migrations
- CORS middleware configured
- Health check endpoint
- Full CRUD for a users resource
- Docker-ready with a multi-stage Dockerfile
- Auto-generated API documentation (Swagger + ReDoc)
