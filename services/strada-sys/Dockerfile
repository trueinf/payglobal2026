FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir --upgrade pip
COPY services/strada-sys/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/strada-sys/app ./app

ENV PORT=8081 PYTHONUNBUFFERED=1
EXPOSE 8081
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
