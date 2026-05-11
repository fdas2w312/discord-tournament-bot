FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data

ENV BOT_TOKEN=""
ENV CHALLONGE_API_KEY=""
ENV DATABASE_PATH="/app/data/bot.db"

CMD ["python3", "main.py"]
