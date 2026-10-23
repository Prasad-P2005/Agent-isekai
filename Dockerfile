FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml README.md ./
COPY isekai ./isekai
COPY client ./client

RUN pip install --no-cache-dir .

ENV ISEKAI_HOST=0.0.0.0 \
    ISEKAI_PORT=8000 \
    ISEKAI_SAVE_DIR=/data

EXPOSE 8000

CMD ["python", "-m", "isekai"]
