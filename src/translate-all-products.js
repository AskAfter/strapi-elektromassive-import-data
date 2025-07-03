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
 * Получить все украинские продукты из Strapi
 */
async function getAllUkrainianProducts() {
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

  while (hasMorePages) {
    console.log(`Получение украинских продуктов, страница ${page}...`.cyan);

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
        `Получено ${products.length} продуктов. Всего: ${allProducts.length}/${total}`.green
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
    console.log(
      `Создание русской локализации для продукта с ID: ${productId}...`.cyan
    );
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
    console.log(`Продукт с ID: ${productId} успешно локализован.`.green);
    return localization.data;
  } catch (error) {
    console.error("Ошибка создания локализации продукта:", error.response?.data || error);
    throw error;
  }
}

/**
 * Перевод одного продукта
 */
async function translateSingleProduct(product) {
  try {
    const productData = product.attributes;
    const productId = product.id;
    const partNumber = productData.part_number;

    console.log(`Начинаю перевод продукта "${partNumber}"...`.yellow);

    // Проверяем, есть ли уже русская локализация
    const hasRussianLocalization = productData.localizations.data.some(
      (loc) => loc.attributes.locale === "ru"
    );

    if (hasRussianLocalization) {
      console.log(
        `Русская локализация для продукта "${partNumber}" уже существует. Пропускаю.`.blue
      );
      return { status: 'skipped', reason: 'already_exists' };
    }

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
            console.log(`⚠ Нет русской локализации для параметра "${parameterValue.attributes?.value}" (ID: ${parameterValue.id})`.yellow);
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
    const russianProduct = await createProductLocalization(productId, localizationData);

    // Привязываем параметры к русскому продукту
    let linkedParametersCount = 0;
    if (russianParameterValueIds.length > 0) {
      console.log(`Привязываем ${russianParameterValueIds.length} параметров к русскому продукту...`.cyan);
      
      for (const parameterValueId of russianParameterValueIds) {
        try {
          await createProductParameter(russianProduct.id, parameterValueId, "ru");
          linkedParametersCount++;
          console.log(`✓ Параметр ${parameterValueId} привязан`.green);
        } catch (error) {
          console.error(`✗ Ошибка привязки параметра ${parameterValueId}:`.red, error.message);
        }
      }
    }

    console.log(`✓ Продукт "${partNumber}" переведен успешно! Привязано параметров: ${linkedParametersCount}`.green.bold);
    return { 
      status: 'success', 
      linkedParameters: linkedParametersCount,
      totalParameters: russianParameterValueIds.length 
    };

  } catch (error) {
    console.error(`Ошибка при переводе продукта "${product.attributes.part_number}":`.red, error.message);
    return { status: 'error', error: error.message };
  }
}

/**
 * Главная функция для перевода всех продуктов
 */
async function translateAllProducts() {
  try {
    console.log("=== Начало перевода всех украинских продуктов на русский ===".blue.bold);
    
    // Получаем все украинские продукты
    const ukrainianProducts = await getAllUkrainianProducts();
    console.log(`Найдено ${ukrainianProducts.length} украинских продуктов`.cyan.bold);

    // Фильтруем продукты, которые еще не имеют русской локализации
    const productsToTranslate = ukrainianProducts.filter(product => 
      !product.attributes.localizations.data.some(loc => loc.attributes.locale === "ru")
    );

    console.log(`Продуктов для перевода: ${productsToTranslate.length}`.yellow.bold);

    if (productsToTranslate.length === 0) {
      console.log("Все продукты уже переведены!".green.bold);
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let totalParametersLinked = 0;

    // Переводим каждый продукт
    for (let i = 0; i < productsToTranslate.length; i++) {
      const product = productsToTranslate[i];
      const progress = `[${i + 1}/${productsToTranslate.length}]`;
      
      console.log(`\n${progress} Обрабатываю продукт "${product.attributes.part_number}"...`.cyan);
      
      const result = await translateSingleProduct(product);
      
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
      if ((i + 1) % 10 === 0 || i === productsToTranslate.length - 1) {
        console.log(`\n--- Прогресс: ${i + 1}/${productsToTranslate.length} (${Math.round(((i + 1) / productsToTranslate.length) * 100)}%) ---`.blue);
        console.log(`✓ Успешно: ${successCount}`.green);
        console.log(`⚠ Пропущено: ${skippedCount}`.yellow);
        console.log(`✗ Ошибок: ${errorCount}`.red);
        console.log(`🔗 Всего параметров привязано: ${totalParametersLinked}`.cyan);
        console.log("---------------------------------------------------");
      }

      // Небольшая пауза между продуктами, чтобы не перегружать API
      if (i < productsToTranslate.length - 1) {
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

// Запускаем перевод всех продуктов
translateAllProducts();
