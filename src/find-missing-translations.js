import axios from "axios";
import "../config/config.js";

const axiosInstance = axios.create({
  baseURL: `${process.env.STRAPI_URL}/graphql`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
  },
});

async function getAllProducts(locale) {
  const query = `
    query GetAllProducts($locale: I18NLocaleCode!, $pagination: PaginationArg) {
      products(locale: $locale, pagination: $pagination) {
        data {
          id
          attributes {
            part_number
            title
            localizations {
              data {
                id
                attributes {
                  locale
                }
              }
            }
          }
        }
        meta {
          pagination {
            total
            page
            pageSize
            pageCount
          }
        }
      }
    }
  `;

  const pageSize = 100;
  let page = 1;
  let allProducts = [];
  let hasMorePages = true;

  while (hasMorePages) {
    console.log(`Получение ${locale} продуктов, страница ${page}...`);

    const variables = {
      locale,
      pagination: {
        page,
        pageSize,
      },
    };

    try {
      const response = await axiosInstance.post("", { query, variables });
      const products = response.data.data.products.data;
      allProducts = [...allProducts, ...products];

      const { total, pageCount } = response.data.data.products.meta.pagination;

      console.log(
        `Получено ${products.length} продуктов. Всего: ${allProducts.length}/${total}`
      );

      if (page >= pageCount) {
        hasMorePages = false;
      } else {
        page++;
      }
    } catch (error) {
      console.error(`Ошибка при получении продуктов:`, error);
      hasMorePages = false;
    }
  }

  return allProducts;
}

async function findMissingTranslations() {
  try {
    console.log("=== Поиск продуктов без русских переводов ===".blue.bold);
    
    // Получаем все украинские продукты
    console.log("\n📋 Получение всех украинских продуктов...".cyan);
    const ukrainianProducts = await getAllProducts("uk");
    
    // Получаем все русские продукты для сравнения
    console.log("\n📋 Получение всех русских продуктов...".cyan);
    const russianProducts = await getAllProducts("ru");

    console.log(`\n📊 Статистика:`.yellow.bold);
    console.log(`🇺🇦 Украинские продукты: ${ukrainianProducts.length}`.blue);
    console.log(`🇷🇺 Русские продукты: ${russianProducts.length}`.red);

    // Создаем Set русских part_number для быстрого поиска
    const russianPartNumbers = new Set(
      russianProducts.map(p => p.attributes.part_number)
    );

    // Находим украинские продукты без русских переводов
    const missingTranslations = [];
    const hasRussianButNotLinked = [];

    for (const ukProduct of ukrainianProducts) {
      const partNumber = ukProduct.attributes.part_number;
      const hasRussianLocalization = ukProduct.attributes.localizations.data.some(
        loc => loc.attributes.locale === "ru"
      );
      const existsAsRussianProduct = russianPartNumbers.has(partNumber);

      if (!hasRussianLocalization && !existsAsRussianProduct) {
        // Совсем нет русского перевода
        missingTranslations.push({
          id: ukProduct.id,
          part_number: partNumber,
          title: ukProduct.attributes.title,
          type: 'completely_missing'
        });
      } else if (!hasRussianLocalization && existsAsRussianProduct) {
        // Русский продукт существует, но не связан как локализация
        hasRussianButNotLinked.push({
          id: ukProduct.id,
          part_number: partNumber,
          title: ukProduct.attributes.title,
          type: 'broken_localization'
        });
      }
    }

    console.log(`\n🔍 Результаты анализа:`.yellow.bold);
    console.log(`❌ Полностью отсутствующие переводы: ${missingTranslations.length}`.red.bold);
    console.log(`🔗 Продукты с поломанными связями: ${hasRussianButNotLinked.length}`.orange);

    if (missingTranslations.length > 0) {
      console.log(`\n❌ Первые 10 продуктов БЕЗ переводов:`.red.bold);
      missingTranslations.slice(0, 10).forEach((product, index) => {
        console.log(`${index + 1}. ID: ${product.id}, Part: ${product.part_number}, Title: "${product.title}"`);
      });
    }

    if (hasRussianButNotLinked.length > 0) {
      console.log(`\n🔗 Первые 10 продуктов с ПОЛОМАННЫМИ связями:`.orange);
      hasRussianButNotLinked.slice(0, 10).forEach((product, index) => {
        console.log(`${index + 1}. ID: ${product.id}, Part: ${product.part_number}, Title: "${product.title}"`);
      });
    }

    const totalMissing = missingTranslations.length + hasRussianButNotLinked.length;
    console.log(`\n📊 Общий итог: ${totalMissing} продуктов нуждаются в переводе/связывании`.yellow.bold);

    return {
      total: totalMissing,
      completelyMissing: missingTranslations.length,
      brokenLocalizations: hasRussianButNotLinked.length,
      missingList: missingTranslations,
      brokenList: hasRussianButNotLinked
    };

  } catch (error) {
    console.error("Ошибка при анализе переводов:", error);
    process.exit(1);
  }
}

// Запуск анализа
findMissingTranslations();
