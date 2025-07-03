import { fileURLToPath } from "url";
import { dirname } from "path";

import slugify from "slugify";
import transliterate from "transliterate";
import axios from "axios";
import { translateText } from "../utils/translation.js";
import { createProductParameter } from "./services/productParameters.js";

import "../config/config.js";
import { logToFile } from "../utils/logToFile.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const axiosInstance = axios.create({
  baseURL: `${process.env.STRAPI_URL}/graphql`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
  },
});

/**
 * Получить все украинские продукты без русских переводов
 */
async function getMissingTranslationProducts() {
  const query = `
    query GetAllUkrainianProducts($pagination: PaginationArg) {
      products(locale: "uk", pagination: $pagination) {
        data {
          id
          attributes {
            part_number
            title
            retail
            currency
            image_link
            slug
            params
            additional_images {
              link
            }
            subcategory {
              data {
                id
                attributes {
                  localizations(filters: { locale: { eq: "ru" } }) {
                    data {
                      id
                    }
                  }
                }
              }
            }
            product_types {
              data {
                id
                attributes {
                  localizations(filters: { locale: { eq: "ru" } }) {
                    data {
                      id
                    }
                  }
                }
              }
            }
            product_parameters {
              data {
                id
                attributes {
                  parameter_value {
                    data {
                      id
                      attributes {
                        value
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
                  }
                }
              }
            }
            discount
            salesCount
            description
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

  console.log("🔍 Получение всех украинских продуктов...".cyan);

  while (hasMorePages) {
    console.log(`Получение украинских продуктов, страница ${page}...`);

    const variables = {
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

  // Фильтруем только продукты без русских локализаций
  const missingTranslations = allProducts.filter(product => 
    !product.attributes.localizations.data.some(loc => loc.attributes.locale === "ru")
  );

  console.log(`\n📊 Найдено продуктов без русских переводов: ${missingTranslations.length}`.yellow.bold);
  
  return missingTranslations;
}

/**
 * Получить русские продукты для проверки дубликатов
 */
async function getRussianProducts() {
  const query = `
    query GetRussianProducts($pagination: PaginationArg) {
      products(locale: "ru", pagination: $pagination) {
        data {
          attributes {
            part_number
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

  console.log("🔍 Получение русских продуктов для проверки дубликатов...".cyan);

  while (hasMorePages) {
    console.log(`Получение русских продуктов, страница ${page}...`);

    const variables = {
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

      if (page >= pageCount) {
        hasMorePages = false;
      } else {
        page++;
      }
    } catch (error) {
      console.error(`Ошибка при получении русских продуктов:`, error);
      hasMorePages = false;
    }
  }

  return new Set(allProducts.map(p => p.attributes.part_number));
}

/**
 * Создание локализации продукта в Strapi
 */
async function createProductLocalization(productId, localizationData) {
  const mutation = `
    mutation CreateProductLocalization($id: ID!, $locale: I18NLocaleCode!, $data: ProductInput!) {
      createProductLocalization(id: $id, locale: $locale, data: $data) {
        data {
          id
          attributes {
            locale
          }
        }
      }
    }
  `;
  try {
    const response = await axiosInstance.post("", {
      query: mutation,
      variables: {
        id: productId,
        locale: "ru",
        data: localizationData,
      },
    });
    const localization =
      response.data.data && response.data.data.createProductLocalization;
    if (!localization) {
      throw new Error(
        `Локализация не создана. Ответ: ${JSON.stringify(response.data)}`
      );
    }
    return localization.data;
  } catch (error) {
    throw error;
  }
}

/**
 * Перевод одного продукта
 */
async function translateSingleProduct(product, russianPartNumbers) {
  try {
    const productData = product.attributes;
    const productId = product.id;
    const partNumber = productData.part_number;

    // Проверяем, не существует ли уже русский продукт с таким part_number
    if (russianPartNumbers.has(partNumber)) {
      console.log(`⚠ Русский продукт с part_number "${partNumber}" уже существует как отдельный продукт`.yellow);
      return { status: 'skipped', reason: 'duplicate_part_number' };
    }

    console.log(`🔄 Переводим продукт "${partNumber}"...`.cyan);

    // Переводим название и описание
    const translatedTitle = await translateText(productData.title, "ru");
    const translatedDescription = productData.description
      ? await translateText(productData.description, "ru")
      : "";

    const translatedSlug = slugify(transliterate(translatedTitle), {
      lower: true,
      strict: true,
    });

    // Собираем русские ID параметров
    const russianParameterValueIds = [];
    if (productData.product_parameters?.data) {
      for (const productParam of productData.product_parameters.data) {
        const parameterValue = productParam.attributes?.parameter_value?.data;
        if (parameterValue) {
          const russianParameterValue = parameterValue.attributes?.localizations?.data?.find(
            (loc) => loc.attributes?.locale === "ru"
          );
          
          if (russianParameterValue) {
            russianParameterValueIds.push(russianParameterValue.id);
          } else {
            console.log(`⚠ Нет русской локализации для параметра "${parameterValue.attributes?.value}"`.yellow);
          }
        }
      }
    }

    // Формируем данные локализации
    const localizationData = {
      title: translatedTitle,
      description: translatedDescription,
      slug: `${translatedSlug}-ru`,
      publishedAt: new Date().toISOString(),
      part_number: productData.part_number,
      retail: productData.retail,
      image_link: productData.image_link,
      currency: productData.currency,
      product_types:
        productData.product_types?.data?.map(
          (pt) => pt.attributes?.localizations?.data?.find((loc) => loc.id)?.id
        )?.filter(id => id) || [],
      subcategory:
        productData.subcategory?.data?.attributes?.localizations?.data?.find(
          (loc) => loc.id
        )?.id || null,
      discount: productData.discount,
      salesCount: productData.salesCount,
    };

    if (productData.additional_images !== undefined) {
      localizationData.additional_images = productData.additional_images;
    }

    // Создаем русскую локализацию продукта
    console.log(`📝 Создание локализации для "${partNumber}"...`.cyan);
    const russianProduct = await createProductLocalization(productId, localizationData);

    // Привязываем параметры к русскому продукту
    let linkedParametersCount = 0;
    if (russianParameterValueIds.length > 0) {
      console.log(`🔗 Привязываем ${russianParameterValueIds.length} параметров...`.cyan);
      
      for (const parameterValueId of russianParameterValueIds) {
        try {
          await createProductParameter(russianProduct.id, parameterValueId, "ru");
          linkedParametersCount++;
        } catch (error) {
          console.error(`✗ Ошибка привязки параметра ${parameterValueId}:`.red, error.message);
        }
      }
    }

    console.log(`✓ Продукт "${partNumber}" переведен! Параметров: ${linkedParametersCount}/${russianParameterValueIds.length}`.green.bold);
    return { 
      status: 'success', 
      linkedParameters: linkedParametersCount,
      totalParameters: russianParameterValueIds.length 
    };

  } catch (error) {
    console.error(`✗ Ошибка при переводе продукта "${product.attributes.part_number}":`.red, error.message);
    return { status: 'error', error: error.message };
  }
}

/**
 * Главная функция для перевода недостающих продуктов
 */
async function translateMissingProducts() {
  try {
    console.log("=== Перевод недостающих украинских продуктов ===".blue.bold);
    
    // Получаем продукты без переводов
    const missingProducts = await getMissingTranslationProducts();
    
    if (missingProducts.length === 0) {
      console.log("✅ Все продукты уже переведены!".green.bold);
      return;
    }

    // Получаем русские продукты для проверки дубликатов
    const russianPartNumbers = await getRussianProducts();

    console.log(`\n🎯 Начинаем перевод ${missingProducts.length} продуктов...`.yellow.bold);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let totalParametersLinked = 0;

    // Переводим каждый продукт
    for (let i = 0; i < missingProducts.length; i++) {
      const product = missingProducts[i];
      const progress = `[${i + 1}/${missingProducts.length}]`;
      
      console.log(`\n${progress} Обрабатываю "${product.attributes.part_number}"...`.cyan);
      
      const result = await translateSingleProduct(product, russianPartNumbers);
      
      switch (result.status) {
        case 'success':
          successCount++;
          totalParametersLinked += result.linkedParameters || 0;
          break;
        case 'error':
          errorCount++;
          break;
        case 'skipped':
          skippedCount++;
          break;
      }

      // Показываем прогресс каждые 10 продуктов
      if ((i + 1) % 10 === 0 || i === missingProducts.length - 1) {
        console.log(`\n--- Прогресс: ${i + 1}/${missingProducts.length} (${Math.round(((i + 1) / missingProducts.length) * 100)}%) ---`.blue);
        console.log(`✓ Успешно: ${successCount}`.green);
        console.log(`⚠ Пропущено: ${skippedCount}`.yellow);
        console.log(`✗ Ошибок: ${errorCount}`.red);
        console.log(`🔗 Параметров привязано: ${totalParametersLinked}`.cyan);
        console.log("---------------------------------------------------");
      }

      // Пауза между продуктами
      if (i < missingProducts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log("\n=== ИТОГОВАЯ СТАТИСТИКА ===".blue.bold);
    console.log(`✓ Успешно переведено: ${successCount}`.green.bold);
    console.log(`⚠ Пропущено: ${skippedCount}`.yellow.bold);
    console.log(`✗ Ошибок: ${errorCount}`.red.bold);
    console.log(`🔗 Всего параметров привязано: ${totalParametersLinked}`.cyan.bold);
    console.log("===============================");

  } catch (error) {
    console.error("Критическая ошибка при переводе продуктов:", error);
    process.exit(1);
  }
}

// Запускаем перевод недостающих продуктов
translateMissingProducts();
