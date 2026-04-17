FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TRANSFORMERS_NO_TORCHVISION=1 \
    HF_HUB_DISABLE_TELEMETRY=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip \
    && pip install --index-url https://download.pytorch.org/whl/cpu torch==2.5.1+cpu \
    && pip install -r requirements.txt

COPY . ./

ARG TRAIN_MODEL=0
RUN if [ "$TRAIN_MODEL" = "1" ] && [ ! -f fine_tuned_model/model.safetensors ]; then python train.py; fi

ENV APP_ENV=production \
    AI_HOST=0.0.0.0 \
    MODEL_PATH=rustumsk/tiwala-bert

EXPOSE 10000

CMD sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"
