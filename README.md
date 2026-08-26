# Saby Stats Report

Chrome MV3-расширение: отчёты статистики Saby по внутренним стендам.

## Экраны

1. **Стенды** — `fix-cloud.sbis.ru` / `test-cloud.sbis.ru` / `pre-cloud.sbis.ru`. Логин, пароль, синхронизация (`SAP.Authenticate` → `/auth/service/`). Cookies (`sid`) сохраняются в браузере.
2. **Фильтры** — имя и JSON. При отчёте подменяется только `period`.
3. **Отчёт** — фильтр, дата-время, `CommonStatistic.GetReport` → `/stats-cloud-interface/service/`, затем PDF.

Запросы идут с `credentials: "include"` через текущее подключение (VPN / внутренний DNS).

## Установка

1. Chrome → `chrome://extensions` → режим разработчика.
2. «Загрузить распакованное» → папка `extension/`.

## Проверка без стенда

```bash
npm test
```
