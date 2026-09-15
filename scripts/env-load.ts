/**
 * Загрузка .env до остальных импортов: lib/db создаёт пул pg на верхнем
 * уровне при импорте, поэтому DATABASE_URL должен быть задан уже там.
 */
import dotenv from "dotenv";

// .env.local имеет приоритет над .env (dotenv не перезаписывает заданные ключи).
dotenv.config({ path: ".env.local" });
dotenv.config();
