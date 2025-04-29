import axios from "axios";

import "../config/config.js";

/**
 * Очистка строки от кавычек, обратных слэшей и лишних пробелов.
 */
function cleanString(str) {
  return str.replace(/["\\]/g, "").trim();
}

/**
 * Корректировка ключа: если строка имеет формат "X - X", возвращается X; также удаляется завершающая точка.
 */
function cleanKey(str) {
  let cleaned = cleanString(str);
  const parts = cleaned.split(" - ");
  if (parts.length === 2 && parts[0] === parts[1]) {
    cleaned = parts[0];
  }
  return cleaned.replace(/\.$/, "");
}

const matches = {
  uk: "украинский",
  ru: "русский",
};

/**
 * Перевод текста через OpenAI (ChatGPT).
 * Если перевод пустой, выбрасывается ошибка.
 * Если переведённый текст совпадает с оригиналом, оставляем его без изменений.
 * Если переведённый текст содержит шаблон "X -> X", возвращаем только первую часть.
 */
async function translateText(text, targetLanguage = "ru") {
  try {
    if (!text || typeof text !== "string") return text;

    const messages = [
      {
        role: "system",
        content: `
Ты профессиональный переводчик, переводящий текст на ${matches[targetLanguage]}. Следуй этим правилам:
1. При переводе названий товаров не добавляй никаких слов – оставляй только точный перевод исходного названия без изменений технических обозначений.
2. Сохраняй исходное форматирование, стили и пунктуацию: если оригинал не содержит завершающих знаков, их не добавляй.
3. Не изменяй числовые значения, технические обозначения, специальные символы и форматирование. Например, названия типа "Провод ШВВП 2х0.5 ГОСТ" или "Провод ШВВП 2х0.75 ГОСТ" должны оставаться неизменными.
4. Переводи максимально точно, передавая общий смысл оригинала без добавления лишних слов.
5. Термин "колодка подовжувача" переводи только как "колодка для удлинителя" или "блок розеток для удлинителя". Другие варианты недопустимы.
6. Не добавляй лишние символы (например, кавычки или точки) в начале или в конце перевода, если их нет в исходном тексте.
7. В названиях товаров не выводи дополнительных пояснений (например, "переводится как", "перевод", "->" и т.д.).
8. Фиксированные переводы для технических характеристик:
   - «Кількість жив» → «Количество жил»
   - «Перетин жив» → «Сечение жил»
9. Если перевод совпадает с оригиналом, оставь его без изменений.
        `,
      },
      {
        role: "user",
        content: `Переведи на ${matches[targetLanguage]}: "${text}"`,
      },
    ];

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages,
        temperature: 0,
        top_p: 1,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    if (
      !response.data ||
      !response.data.choices ||
      !response.data.choices[0] ||
      !response.data.choices[0].message
    ) {
      throw new Error("Некорректный ответ от API OpenAI");
    }

    let translated = cleanString(response.data.choices[0].message.content);
    // Если результат содержит шаблон "X -> X", оставляем только первую часть.
    if (translated.includes("->")) {
      const parts = translated.split("->").map((s) => s.trim());
      if (parts.length === 2 && parts[0] === parts[1]) {
        translated = parts[0];
      }
    }

    if (translated.length === 0) {
      throw new Error(`Ошибка перевода. Оригинал: "${text}" - Перевод пустой.`);
    }

    if (translated === text) {
      console.log(`Перевод совпадает с оригиналом: "${text}"`.yellow);
    } else {
      console.log(
        `Перевод успешно выполнен. Оригинал: "${text}" - Перевод: "${translated}"`
      );
    }
    return translated;
  } catch (error) {
    console.error("Ошибка перевода через ChatGPT:".red, error);
    throw error;
  }
}

export { translateText, cleanString, cleanKey };
