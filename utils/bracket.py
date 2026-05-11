"""
Генератор турнирной сетки с Unicode box-drawing символами (Single Elimination).

Визуальная сетка в Discord через моноширинный код-блок:

  ┌──────────────┐
  │  Team Alpha   │──┐
  └──────────────┘  │
                    ├──┐
  ┌──────────────┐  │  │
  │  Team Beta    │──┘  │
  └──────────────┘     │
                        ├──┐
  ┌──────────────┐     │  │
  │  Team Gamma   │──┐  │  │
  └──────────────┘  │  │  │
                    ├──┘  │
  ┌──────────────┐  │     │
  │  Team Delta   │──┘    │
  └──────────────┘       │
                          ├── Champion
  ┌──────────────┐       │
  │  Team Epsilon │──┐   │
  └──────────────┘  │   │
                    ├──┐ │
  ┌──────────────┐  │  │ │
  │  Team Zeta    │──┘  │ │
  └──────────────┘     │ │
                        ├──┘
  ┌──────────────┐     │
  │  Team Eta     │──┐  │
  └──────────────┘  │  │
                    ├──┘
  ┌──────────────┐  │
  │  Team Theta   │──┘
  └──────────────┘

Поддерживает:
  - 2, 4, 8, 16, 32 участника (степени двойки, с bye)
  - Статусы: ⏳ ожидание, ⚔️ играется, ✅ завершён
  - Победители выделены ★, проигравшие зачёркнуты
  - Автоматическое масштабирование под длину имён
"""

from __future__ import annotations

import math


# ---------------------------------------------------------------------------
# Хелперы
# ---------------------------------------------------------------------------

def _round_label(max_round: int, current_round: int) -> str:
    diff = max_round - current_round
    if diff == 0:
        return "Финал"
    if diff == 1:
        return "Полуфинал"
    if diff == 2:
        return "Четвертьфинал"
    return f"Раунд {current_round}"


def _clip(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len - 1] + "…"


# ---------------------------------------------------------------------------
# Списочная сетка (для этапов с матчами)
# ---------------------------------------------------------------------------

def generate_bracket(
    teams: list[dict],
    matches: list[dict],
    tournament_name: str = "Турнир",
    challonge_url: str = "",
) -> str:
    """
    Генерирует турнирную сетку в виде списка матчей по раундам
    с визуальным оформлением и статусами.
    """
    if not matches:
        return generate_bracket_simple(teams, tournament_name)

    team_map = {t["id"]: t for t in teams}
    max_round = max(m["round"] for m in matches)

    # Группируем матчи по раундам
    rounds: dict[int, list[dict]] = {}
    for m in matches:
        rounds.setdefault(m["round"], []).append(m)
    for r in rounds:
        rounds[r].sort(key=lambda m: m["match_index"])

    # Ширина имён
    name_width = 12
    for m in matches:
        for slot in ("team1_id", "team2_id"):
            tid = m.get(slot, 0)
            if tid and tid in team_map:
                name_width = max(name_width, min(len(team_map[tid].get("name", "")) + 2, 20))

    lines: list[str] = []
    lines.append(f"🏆 **{tournament_name}**")
    lines.append("")

    # Статистика
    total = len(matches)
    completed = sum(1 for m in matches if m["status"] == "completed")
    playing = sum(1 for m in matches if m["status"] == "playing")
    pending = total - completed - playing
    lines.append(f"📊 {total} матчей: ✅ {completed}  ⚔️ {playing}  ⏳ {pending}")
    lines.append("")

    # Для каждого раунда
    for rnd in range(1, max_round + 1):
        round_matches = rounds.get(rnd, [])
        if not round_matches:
            continue

        label = _round_label(max_round, rnd)

        for m in round_matches:
            t1_id = m.get("team1_id", 0)
            t2_id = m.get("team2_id", 0)
            winner_id = m.get("winner_id", 0) or 0
            status = m.get("status", "pending")
            score = m.get("score", "") or ""
            match_num = m.get("match_index", 0) + 1

            # Имена
            t1_name = _get_team_name(t1_id, team_map, name_width)
            t2_name = _get_team_name(t2_id, team_map, name_width)

            # Статус
            if status == "completed":
                status_icon = "✅"
            elif status == "playing":
                status_icon = "⚔️"
            else:
                status_icon = "⏳"

            # Маркеры победителя
            t1_mark = " ★" if winner_id and winner_id == t1_id else "  "
            t2_mark = " ★" if winner_id and winner_id == t2_id else "  "

            # Зачёркивание проигравших
            if winner_id and winner_id != t1_id and t1_id:
                t1_name = f"~~{t1_name}~~"
            if winner_id and winner_id != t2_id and t2_id:
                t2_name = f"~~{t2_name}~~"

            score_str = f"  [{score}]" if score else ""

            # Bye
            if t1_id and not t2_id:
                lines.append(f"┌{'─' * (name_width + 4)}┐")
                lines.append(f"│{t1_mark} {t1_name:<{name_width}}   │ ← bye")
                lines.append(f"└{'─' * (name_width + 4)}┘  {status_icon}")
            elif not t1_id and t2_id:
                lines.append(f"┌{'─' * (name_width + 4)}┐")
                lines.append(f"│{t2_mark} {t2_name:<{name_width}}   │ ← bye")
                lines.append(f"└{'─' * (name_width + 4)}┘  {status_icon}")
            else:
                # Обычный матч
                lines.append(f"┌{'─' * (name_width + 4)}┐  {label if m == round_matches[0] else ''}")
                lines.append(f"│{t1_mark} {t1_name:<{name_width}}   │  {status_icon}{score_str}")
                lines.append(f"│{t2_mark} {t2_name:<{name_width}}   │")
                lines.append(f"└{'─' * (name_width + 4)}┘")

            # Разделитель между матчами
            if m != round_matches[-1]:
                lines.append("")

        # Разделитель между раундами
        if rnd < max_round:
            lines.append("")
            lines.append(f"{'─' * 30}")
            lines.append("")

    # Чемпион
    final_matches = rounds.get(max_round, [])
    if final_matches:
        fm = final_matches[0]
        if fm.get("winner_id") and fm["winner_id"] in team_map:
            champ = team_map[fm["winner_id"]]
            lines.append("")
            lines.append(f"🏆 **Чемпион: {champ.get('name', '???')}**")

    text = "\n".join(lines)
    if len(text) > 3900:
        text = text[:3890] + "\n…"

    return text


def _get_team_name(team_id: int, team_map: dict, max_len: int) -> str:
    if not team_id:
        return "TBD"
    team = team_map.get(team_id)
    if not team:
        return "???"
    return _clip(team.get("name", "???"), max_len)


# ---------------------------------------------------------------------------
# Визуальная сетка box-drawing (превью — без матчей, только посев)
# ---------------------------------------------------------------------------

def generate_bracket_simple(
    teams: list[dict],
    tournament_name: str = "Турнир",
    challonge_url: str = "",
) -> str:
    """
    Превью сетки — визуальная расстановка команд по посеву
    с Unicode box-drawing.
    """
    if not teams:
        return f"🏆 {tournament_name}\n\nПока нет команд"

    approved = [t for t in teams if t.get("approved")]
    if not approved:
        return f"🏆 {tournament_name}\n\nНет одобренных команд"

    n = len(approved)
    bracket_size = 1
    while bracket_size < n:
        bracket_size *= 2

    num_rounds = int(math.log2(bracket_size))
    first_round_matches = bracket_size // 2
    byes = bracket_size - n

    # Стандартный посев
    seeded = list(approved)
    seeded = _standard_seed_order(seeded)

    # Расставляем команды в матчи
    r1_matchups: list[tuple] = []
    team_idx = 0
    for i in range(first_round_matches):
        t1 = None
        t2 = None
        if i < byes:
            if team_idx < n:
                t1 = seeded[team_idx]
                team_idx += 1
            t2 = None
        else:
            if team_idx < n:
                t1 = seeded[team_idx]
                team_idx += 1
            if team_idx < n:
                t2 = seeded[team_idx]
                team_idx += 1
        r1_matchups.append((t1, t2))

    # Ширина имён
    name_width = 10
    for t in approved:
        name_width = max(name_width, min(len(t.get("name", "")) + 1, 18))

    # Строим визуальную сетку
    bracket_lines = _build_box_bracket(r1_matchups, num_rounds, name_width, bracket_size)

    lines: list[str] = []
    lines.append(f"🏆 **{tournament_name}**")
    lines.append("")
    lines.append("```")
    lines.extend(bracket_lines)
    lines.append("```")

    text = "\n".join(lines)
    if len(text) > 3900:
        text = text[:3890] + "\n…"

    return text


def _build_box_bracket(
    r1_matchups: list[tuple],
    num_rounds: int,
    name_width: int,
    bracket_size: int,
) -> list[str]:
    """
    Строит визуальную сетку с Unicode box-drawing.

    Каждая команда — коробка:
      ┌─────────┐
      │ Player1  │
      └─────────┘

    Пары соединяются через ─┤ и ├── к следующему раунду.
    """
    # Размеры
    box_w = name_width + 2  # внутренняя ширина + padding
    col_gap = 3             # горизонтальный зазор для соединений

    # Структура: для каждого раунда вычисляем Y-позиции матчей
    # Матч = 2 команды в коробках, высота = 3 строки (top, name, bottom)
    # Между матчами в R1 — 0 строк (box bottom = box top для team2)
    # Полный матч (2 команды) занимает 5 строк:
    #   ┌───┐
    #   │ T1 │
    #   └───┘  <- bottom of T1 = top of T2 для пары
    #   │ T2 │
    #   └───┘
    # Но мы рисуем их как:
    #   ┌───┐
    #   │ T1 │
    #   ├───┤  <- средняя линия
    #   │ T2 │
    #   └───┘
    # Высота = 5 строк на матч

    match_height = 5  # строки на один матч (включая обе команды)
    # В первом раунде: матч + gap
    # В следующем: 2 матча сливаются → Y-центр между ними

    # Рассчитываем Y-позиции для каждого матча в каждом раунде
    # Y — верхняя строка матча (строка с ┌───┐)

    round_match_positions: dict[int, list[int]] = {}  # rnd -> [y_top, ...]

    # Раунд 1: матчи идут подряд с gap=1
    y = 0
    gap_r1 = 1
    r1_positions = []
    for i in range(len(r1_matchups)):
        r1_positions.append(y)
        y += match_height + gap_r1
    round_match_positions[1] = r1_positions

    # Последующие раунды: Y-центр = среднее Y-центров двух предыдущих матчей
    for rnd in range(2, num_rounds + 1):
        prev_positions = round_match_positions[rnd - 1]
        curr_positions = []
        for i in range(0, len(prev_positions), 2):
            y1_center = prev_positions[i] + match_height // 2
            y2_center = prev_positions[i + 1] + match_height // 2
            y_center = (y1_center + y2_center) // 2
            y_top = y_center - match_height // 2
            curr_positions.append(y_top)
        round_match_positions[rnd] = curr_positions

    # Общая высота
    if round_match_positions[1]:
        total_height = round_match_positions[1][-1] + match_height
    else:
        total_height = match_height

    # X-позиции для каждого раунда
    round_x: dict[int, int] = {}
    x = 0
    for rnd in range(1, num_rounds + 1):
        round_x[rnd] = x
        x += box_w + 2 + col_gap  # +2 для границ ┌┐

    total_width = x - col_gap

    # Создаём сетку
    grid: list[list[str]] = [[' '] * total_width for _ in range(total_height)]

    def put(r: int, c: int, ch: str) -> None:
        if 0 <= r < total_height and 0 <= c < total_width:
            grid[r][c] = ch

    def put_h(r: int, c_start: int, c_end: int) -> None:
        for c in range(c_start, c_end + 1):
            put(r, c, '─')

    def put_text(r: int, c: int, text: str) -> None:
        for i, ch in enumerate(text):
            if c + i < total_width:
                grid[r][c + i] = ch

    def draw_match_box(y_top: int, x_left: int, name1: str, name2: str) -> None:
        """Рисует коробку матча с двумя командами."""
        # ┌───────┐
        put(y_top, x_left, '┌')
        put_h(y_top, x_left + 1, x_left + box_w)
        put(y_top, x_left + box_w + 1, '┐')

        # │ Name1  │
        put(y_top + 1, x_left, '│')
        n1 = f" {name1}".ljust(box_w)
        put_text(y_top + 1, x_left + 1, n1)
        put(y_top + 1, x_left + box_w + 1, '│')

        # ├───────┤
        put(y_top + 2, x_left, '├')
        put_h(y_top + 2, x_left + 1, x_left + box_w)
        put(y_top + 2, x_left + box_w + 1, '┤')

        # │ Name2  │
        put(y_top + 3, x_left, '│')
        n2 = f" {name2}".ljust(box_w)
        put_text(y_top + 3, x_left + 1, n2)
        put(y_top + 3, x_left + box_w + 1, '│')

        # └───────┘
        put(y_top + 4, x_left, '└')
        put_h(y_top + 4, x_left + 1, x_left + box_w)
        put(y_top + 4, x_left + box_w + 1, '┘')

    # --- Рисуем матчи первого раунда ---
    for idx, (t1, t2) in enumerate(r1_matchups):
        y_top = round_match_positions[1][idx]
        x_left = round_x[1]

        name1 = _clip(t1['name'] if t1 else "TBD", name_width)
        name2 = _clip(t2['name'] if t2 else "BYE", name_width) if t2 else "BYE"

        if t2 is None:
            # Bye — только одна команда, маленькая коробка
            # ┌───────┐
            put(y_top, x_left, '┌')
            put_h(y_top, x_left + 1, x_left + box_w)
            put(y_top, x_left + box_w + 1, '┐')
            # │ Name  │
            put(y_top + 1, x_left, '│')
            n1 = f" {name1}".ljust(box_w)
            put_text(y_top + 1, x_left + 1, n1)
            put(y_top + 1, x_left + box_w + 1, '│')
            # └───────┘
            put(y_top + 2, x_left, '└')
            put_h(y_top + 2, x_left + 1, x_left + box_w)
            put(y_top + 2, x_left + box_w + 1, '┘')
        else:
            draw_match_box(y_top, x_left, name1, name2)

    # --- Рисуем последующие раунды и соединения ---
    for rnd in range(2, num_rounds + 1):
        prev_positions = round_match_positions[rnd - 1]
        curr_positions = round_match_positions[rnd]
        prev_x = round_x[rnd - 1]
        curr_x = round_x[rnd]

        matches_in_round = len(curr_positions)

        for m_idx in range(matches_in_round):
            y_top = curr_positions[m_idx]
            x_left = curr_x

            # Соединения от предыдущего раунда (рисуем ПЕРЕД коробкой, чтобы коробка перезаписала)
            prev1_y = prev_positions[m_idx * 2]
            prev2_y = prev_positions[m_idx * 2 + 1]

            # Y-центры предыдущих матчей (средняя линия ├───┤)
            prev1_center = prev1_y + match_height // 2
            prev2_center = prev2_y + match_height // 2

            # X: от правого края предыдущей коробки до левого края текущей
            box_right_x = prev_x + box_w + 1  # позиция правой границы ┘
            conn_x_start = box_right_x + 1     # первый свободный столбец после ┘
            conn_x_end = curr_x - 1            # последний столбец перед ┌ текущей коробки

            # Горизонтальные линии от правого края каждого матча
            for cx in range(conn_x_start, conn_x_end + 1):
                put(prev1_center, cx, '─')
                put(prev2_center, cx, '─')

            # Вертикальная соединительная линия (на последнем столбце перед текущей коробкой)
            mid_x = conn_x_end
            y_min = min(prev1_center, prev2_center)
            y_max = max(prev1_center, prev2_center)

            # Рисуем вертикальную линию
            for ry in range(y_min, y_max + 1):
                if ry == y_min and ry == y_max:
                    put(ry, mid_x, '─')
                elif ry == y_min:
                    put(ry, mid_x, '├')
                elif ry == y_max:
                    put(ry, mid_x, '┤')
                else:
                    put(ry, mid_x, '│')

            # Горизонтальная линия от соединения к текущему матчу
            curr_center = y_top + match_height // 2
            for cx in range(mid_x, curr_x):
                put(curr_center, cx, '─')

            # Теперь рисуем коробку TBD (поверх соединений)
            draw_match_box(y_top, x_left, "TBD", "TBD")

    # Добавляем подписи раундов
    result_lines: list[str] = []

    # Конвертируем сетку в строки
    for row in grid:
        line = ''.join(row).rstrip()
        result_lines.append(line)

    # Убираем лишние пустые строки в конце
    while result_lines and not result_lines[-1].strip():
        result_lines.pop()

    return result_lines


# ---------------------------------------------------------------------------
# Хелперы посева
# ---------------------------------------------------------------------------

def _standard_seed_order(teams: list[dict]) -> list[dict]:
    """
    Расставляет команды по стандартному турнирному посеву.
    Для 8 команд: 1,8,4,5,3,6,2,7
    Это гарантирует, что 1 и 2 семя встретятся только в финале.
    """
    n = len(teams)
    if n <= 2:
        return teams

    bracket_size = 1
    while bracket_size < n:
        bracket_size *= 2

    order = _seed_positions(bracket_size)
    result = [None] * n
    pos = 0
    for seed_pos in order:
        if pos < n and seed_pos < n:
            result[seed_pos] = teams[pos]
            pos += 1

    # Заполняем None
    final = []
    used = set()
    for item in result:
        if item is not None:
            final.append(item)
            used.add(item["id"])
    for t in teams:
        if t["id"] not in used:
            final.append(t)
    return final


def _seed_positions(size: int) -> list[int]:
    """
    Возвращает массив позиций для стандартного турнирного посева.
    Для size=8: [0, 7, 3, 4, 1, 6, 2, 5]
    (1v8, 4v5, 3v6, 2v7)
    """
    if size == 1:
        return [0]
    if size == 2:
        return [0, 1]

    half = size // 2
    sub = _seed_positions(half)
    result = []
    for s in sub:
        result.append(s)
        result.append(size - 1 - s)
    return result
