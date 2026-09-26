FROM python:3.11-slim

# Native libraries for WeasyPrint (invoice PDFs) + fonts with the ₹ glyph.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libharfbuzz-subset0 \
        libcairo2 libgdk-pixbuf-2.0-0 libffi8 shared-mime-info \
        fonts-dejavu-core fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8001
# Exactly ONE worker: APScheduler jobs and Socket.IO rooms live in-process.
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]
