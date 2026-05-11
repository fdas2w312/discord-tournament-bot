"""
Асинхронный клиент Challonge API v1.

Документация: https://api.challonge.com/v1/documents
Аутентификация: HTTP Basic Auth (API key как username, пароль пустой).
"""

from __future__ import annotations

import logging
import aiohttp

logger = logging.getLogger("challonge")

BASE_URL = "https://api.challonge.com/v1"


class ChallongeError(Exception):
    """Ошибка при работе с Challonge API."""


class ChallongeClient:
    """Асинхронный клиент для Challonge API."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._session: aiohttp.ClientSession | None = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            auth = aiohttp.BasicAuth(login=self._api_key, password="")
            self._session = aiohttp.ClientSession(auth=auth)
        return self._session

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None

    # ------------------------------------------------------------------
    # Внутренние хелперы
    # ------------------------------------------------------------------

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_data: dict | None = None,
        params: dict | None = None,
    ) -> dict | list:
        session = await self._get_session()
        url = f"{BASE_URL}{path}"

        try:
            async with session.request(
                method, url, json=json_data, params=params,
            ) as resp:
                body = await resp.json()

                if resp.status >= 400:
                    error_msg = body.get("errors", [str(body)]) if isinstance(body, dict) else str(body)
                    logger.error("Challonge API error %s %s -> %s: %s", method, path, resp.status, error_msg)
                    raise ChallongeError(f"API error {resp.status}: {error_msg}")

                return body  # type: ignore

        except aiohttp.ClientError as exc:
            logger.error("Challonge connection error: %s", exc)
            raise ChallongeError(f"Connection error: {exc}") from exc

    # ------------------------------------------------------------------
    # ТУРНИРЫ
    # ------------------------------------------------------------------

    async def create_tournament(
        self,
        name: str,
        url: str,
        tournament_type: str = "single elimination",
        description: str = "",
        open_signup: bool = False,
        hold_third_place_match: bool = False,
    ) -> dict:
        """
        Создаёт турнир на Challonge.

        Args:
            name: Название турнира
            url: Уникальный URL-слаг (например, 'my-tournament-2026')
            tournament_type: Тип турнира ('single elimination', 'double elimination', etc.)
            description: Описание турнира
            open_signup: Разрешить открытую регистрацию на Challonge
            hold_third_place_match: Матч за 3-е место

        Returns:
            dict с данными созданного турнира
        """
        data = {
            "tournament": {
                "name": name,
                "url": url,
                "tournament_type": tournament_type,
                "description": description,
                "open_signup": open_signup,
                "hold_third_place_match": hold_third_place_match,
            }
        }
        result = await self._request("POST", "/tournaments.json", json_data=data)
        return result  # type: ignore

    async def get_tournament(self, tournament_url: str) -> dict:
        """Получает информацию о турнире по URL-слагу."""
        result = await self._request("GET", f"/tournaments/{tournament_url}.json")
        return result  # type: ignore

    async def start_tournament(self, tournament_url: str) -> dict:
        """Запускает турнир (начинает генерацию сетки на Challonge)."""
        result = await self._request(
            "POST", f"/tournaments/{tournament_url}/start.json",
        )
        return result  # type: ignore

    async def finalize_tournament(
        self,
        tournament_url: str,
    ) -> dict:
        """Завершает турнир на Challonge."""
        result = await self._request(
            "POST", f"/tournaments/{tournament_url}/finalize.json",
        )
        return result  # type: ignore

    async def delete_tournament(self, tournament_url: str) -> None:
        """Удаляет турнир на Challonge."""
        await self._request("DELETE", f"/tournaments/{tournament_url}.json")

    # ------------------------------------------------------------------
    # УЧАСТНИКИ
    # ------------------------------------------------------------------

    async def add_participant(
        self,
        tournament_url: str,
        name: str,
        seed: int | None = None,
    ) -> dict:
        """
        Добавляет участника в турнир на Challonge.

        Args:
            tournament_url: URL-слаг турнира
            name: Имя участника / команды
            seed: Посев (опционально)

        Returns:
            dict с данными участника (включая participant.id)
        """
        data: dict = {
            "participant": {
                "name": name,
            }
        }
        if seed is not None:
            data["participant"]["seed"] = seed

        result = await self._request(
            "POST",
            f"/tournaments/{tournament_url}/participants.json",
            json_data=data,
        )
        return result  # type: ignore

    async def bulk_add_participants(
        self,
        tournament_url: str,
        participants: list[dict],
    ) -> list:
        """
        Массовое добавление участников.

        Args:
            tournament_url: URL-слаг турнира
            participants: Список словарей {"name": ..., "seed": ...}

        Returns:
            list с данными добавленных участников
        """
        data = {
            "participants": [
                {"name": p["name"], **({"seed": p["seed"]} if "seed" in p else {})}
                for p in participants
            ]
        }
        result = await self._request(
            "POST",
            f"/tournaments/{tournament_url}/participants/bulk_add.json",
            json_data=data,
        )
        return result  # type: ignore

    async def delete_participant(self, tournament_url: str, participant_id: int) -> None:
        """Удаляет участника из турнира на Challonge."""
        await self._request(
            "DELETE",
            f"/tournaments/{tournament_url}/participants/{participant_id}.json",
        )

    # ------------------------------------------------------------------
    # МАТЧИ
    # ------------------------------------------------------------------

    async def get_matches(
        self,
        tournament_url: str,
        state: str | None = None,
    ) -> list:
        """
        Получает список матчей турнира.

        Args:
            tournament_url: URL-слаг турнира
            state: Фильтр по статусу ('open', 'pending', 'complete')

        Returns:
            list с данными матчей
        """
        params = {}
        if state:
            params["state"] = state

        result = await self._request(
            "GET",
            f"/tournaments/{tournament_url}/matches.json",
            params=params if params else None,
        )
        return result  # type: ignore

    async def update_match(
        self,
        tournament_url: str,
        match_id: int,
        *,
        winner_id: int | None = None,
        scores_csv: str = "",
    ) -> dict:
        """
        Обновляет результат матча на Challonge.

        Args:
            tournament_url: URL-слаг турнира
            match_id: ID матча на Challonge
            winner_id: ID участника-победителя на Challonge (participant_id)
            scores_csv: Счёт в формате "3-1,2-1" (через запятую для серий)

        Returns:
            dict с обновлёнными данными матча
        """
        data: dict = {
            "match": {}
        }
        if winner_id is not None:
            data["match"]["winner_id"] = winner_id
        if scores_csv:
            data["match"]["scores_csv"] = scores_csv

        result = await self._request(
            "PUT",
            f"/tournaments/{tournament_url}/matches/{match_id}.json",
            json_data=data,
        )
        return result  # type: ignore

    # ------------------------------------------------------------------
    # УТИЛИТЫ
    # ------------------------------------------------------------------

    @staticmethod
    def extract_tournament_id(response: dict) -> str:
        """Извлекает ID турнира из ответа API."""
        t = response.get("tournament", response)
        return str(t.get("id", ""))

    @staticmethod
    def extract_tournament_url(response: dict) -> str:
        """Извлекает URL-слаг турнира из ответа API."""
        t = response.get("tournament", response)
        return str(t.get("url", ""))

    @staticmethod
    def extract_participant_id(response: dict) -> int:
        """Извлекает participant ID из ответа API."""
        p = response.get("participant", response)
        return int(p.get("id", 0))

    @staticmethod
    def extract_match_id(response: dict) -> int:
        """Извлекает match ID из ответа API."""
        m = response.get("match", response)
        return int(m.get("id", 0))

    @staticmethod
    def build_full_url(tournament_url: str) -> str:
        """Строит полную ссылку на турнир на Challonge."""
        return f"https://challonge.com/{tournament_url}"

    @staticmethod
    def build_image_url(tournament_url: str) -> str:
        """Возвращает ссылку на изображение сетки турнира."""
        return f"https://challonge.com/{tournament_url}.svg"
