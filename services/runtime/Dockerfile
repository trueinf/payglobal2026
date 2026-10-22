FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir --upgrade pip
COPY services/runtime/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/runtime/app ./app
COPY packages/schema ./packages/schema
ENV PORT=8080 PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
