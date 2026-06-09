# Дашборд поставок WB

Веб-страница для **Насти** и **Марго**: остатки, оборачиваемость, план довоза, распределение по складам.

## Ссылка (после включения GitHub Pages)

`https://wedoubledi-web.github.io/kursor-wb/`

> Один раз: GitHub → репозиторий `kursor-wb` → Settings → Pages → Source: **GitHub Actions**.

## Что внутри

| Вкладка | Содержание |
|---------|------------|
| **План довоза** | Остаток → запас в днях → довоз → запас после |
| **По складам** | Где лежит сейчас + куда везти + таблицы по складу |
| **Все остатки** | 102 SKU, статус, оборачиваемость |
| **Не грузить** | Минусовые RASK, перезапас Insight |

## Обновление данных

```bash
python3 Бизнес/Логистика/scripts/wb_logistics_fetch.py
python3 Бизнес/Логистика/scripts/build_logistics_dashboard.py
git add Бизнес/Логистика/ && git commit -m "logistics: update dashboard" && git push
```

Или в Cursor: **`логист api обнови`** → **`логист дашборд`**.

После push workflow `Logistics Dashboard` пересоберёт сайт (~1–2 мин).

## Локально

Открыть `index.html` в браузере или:

```bash
python3 -m http.server 8765 --directory Бизнес/Логистика/Дашборд
```

→ http://localhost:8765
