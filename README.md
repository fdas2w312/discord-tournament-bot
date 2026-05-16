# Discord Bot — AFK/Inactive & Roll (Python)

Бот для Discord на Python с системой статусов AFK/Inactive и роллом по реакциям.

## Команды

### AFK
- `/afk set <minutes>` — уйти в AFK на N минут (1-1440)
- `/afk off` — снять AFK досрочно

### Inactive
- `/inactive set <from_date> <to_date>` — уйти в инактив (форматы: ДД.ММ.ГГГГ или YYYY-MM-DD)
- `/inactive off` — снять Inactive досрочно

### Status
- `/status` — вывести таблицу AFK/Inactive

### Roll
- `/roll reak <message> [emoji] [time_seconds]` — ролл среди реактивших на указанное сообщение
- `/roll reak_emergency <message> [emoji]` — мгновенный ролл
- `/roll cancel` — отменить активный ролл

## Установка

```bash
pip install -r requirements.txt
```

## Настройка

Скопируй `.env.example` в `.env` и заполни:

```
DISCORD_TOKEN=токен_бота
GUILD_ID=id_сервера
CLIENT_ID=id_приложения
AFK_ROLE_ID=id_роли_afk
INACTIVE_ROLE_ID=id_роли_inactive
STATUS_CHANNEL_ID=id_канала_таблицы
MODERATOR_ROLE_ID=id_роли_модератора
ROLL_EMOJI=✅
ROLL_COLLECT_TIMEOUT=300
STATUS_UPDATE_INTERVAL=60
```

## Запуск

```bash
python main.py
```

## Деплой на Railway

Railway автоматически определит Python проект по `requirements.txt` и запустит `python main.py`.

## Структура

```
├── main.py              # Точка входа
├── config.py            # Конфигурация из .env
├── requirements.txt     # Зависимости Python
├── commands/
│   ├── afk.py
│   ├── inactive.py
│   ├── status.py
│   └── roll.py
├── database/
│   └── db.py            # SQLite
├── utils/
│   └── embeds.py        # Embed builders
└── tasks/
    └── background.py    # Фоновые задачи
```
