FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

COPY . ./

RUN if [ ! -f fine_tuned_model/model.safetensors ]; then python train.py; fi

ENV APP_ENV=production \
    AI_HOST=0.0.0.0

EXPOSE 10000

CMD sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"
