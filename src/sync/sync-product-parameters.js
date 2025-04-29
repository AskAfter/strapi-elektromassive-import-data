import { fileURLToPath } from "url";
import { dirname } from "path";
import "../../config/config.js";
import "colors";
import axios from "axios";
import readline from "readline";
import {
  createProductParameter,
  getProductParameters,
} from "../services/productParameters.js";
import { getParameterValueLocalization } from "../services/parameterValues.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const axiosInstance = axios.create({
  baseURL: `${process.env.STRAPI_URL}/graphql`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
  },
});

// Кэш для хранения соответствий между локализациями продуктов
const productLocalizationsCache = new Map();
// Кэш для хранения соответствий между локализациями значений параметров
const parameterValueLocalizationsCache = new Map();

async function getProductsWithParameters(locale) {
  const query = `
    query GetProductsWithParameters($locale: I18NLocaleCode!, $pagination: PaginationArg) {
      products(locale: $locale, pagination: $pagination) {
        data {
          id
          attributes {
            title
            part_number
            product_parameters {
              data {
                id
                attributes {
                  parameter_value {
                    data {
                      id
                      attributes {
                        value
                        code
                        parameter_type {
                          data {
                            id
                            attributes {
                              name
                              slug
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
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

  const pageSize = 50;
  let page = 1;
  let allProducts = [];
  let hasMorePages = true;

  while (hasMorePages) {
    console.log(
      `Fetching products with parameters for locale "${locale}", page ${page}...`
    );

    const variables = {
      locale,
      pagination: {
        page,
        pageSize,
      },
    };

    try {
      const { data } = await axiosInstance.post("", { query, variables });

      const products = data.data.products.data;
      allProducts = [...allProducts, ...products];

      const { total, pageCount } = data.data.products.meta.pagination;

      console.log(
        `Fetched ${products.length} products. Total: ${allProducts.length}/${total}`
      );

      if (page >= pageCount) {
        hasMorePages = false;
      } else {
        page++;
      }
    } catch (error) {
      console.error(`Error fetching products with parameters:`, error);
      hasMorePages = false;
    }
  }

  return allProducts;
}

async function getProductLocalization(productId, targetLocale) {
  const cacheKey = `${productId}_${targetLocale}`;

  if (productLocalizationsCache.has(cacheKey)) {
    return productLocalizationsCache.get(cacheKey);
  }

  const query = `
    query GetProduct($id: ID!) {
      product(id: $id) {
        data {
          attributes {
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
  `;

  const variables = {
    id: productId,
  };

  try {
    const { data } = await axiosInstance.post("", { query, variables });
    const localizations = data.data.product.data.attributes.localizations.data;
    const targetLocalization = localizations.find(
      (loc) => loc.attributes.locale === targetLocale
    );

    const result = targetLocalization ? targetLocalization.id : null;
    productLocalizationsCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`Error getting product localization:`, error);
    return null;
  }
}

async function syncProductParameters(products, sourceLocale, targetLocale) {
  console.log(
    `\nStarting synchronization of product parameters from ${sourceLocale} to ${targetLocale}...`
      .blue
  );

  let totalProducts = products.length;
  let processedProducts = 0;
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let alreadyExistsCount = 0;

  for (const product of products) {
    processedProducts++;
    const productId = product.id;
    const productTitle = product.attributes.title;
    const partNumber = product.attributes.part_number;

    console.log(
      `\n[${processedProducts}/${totalProducts}] Processing product "${productTitle}" (${partNumber})`
        .cyan
    );

    // Получаем ID локализации продукта для целевого языка
    const localizedProductId = await getProductLocalization(
      productId,
      targetLocale
    );

    if (!localizedProductId) {
      console.log(
        `⚠ Skipping product "${productTitle}" - no ${targetLocale} localization`
          .yellow
      );
      skippedCount++;
      continue;
    }

    // Получаем все значения параметров для этого продукта
    const productParameters = product.attributes.product_parameters.data;

    if (productParameters.length === 0) {
      console.log(
        `⚠ Skipping product "${productTitle}" - no parameter values`.yellow
      );
      skippedCount++;
      continue;
    }

    console.log(
      `Found ${productParameters.length} parameter values for product "${productTitle}"`
        .cyan
    );

    // Получаем существующие связи product_parameter для локализованного продукта
    const existingParameters = await getProductParameters(
      localizedProductId,
      targetLocale
    );
    const existingParameterValueIds = existingParameters.map(
      (param) => param.attributes.parameter_value.data.id
    );

    console.log(
      `Product already has ${existingParameterValueIds.length} parameters in ${targetLocale} locale`
        .cyan
    );

    let productSuccessCount = 0;
    let productErrorCount = 0;
    let productSkippedCount = 0;
    let productAlreadyExistsCount = 0;

    // Для каждого значения параметра создаем связь с локализованным продуктом
    for (const productParam of productParameters) {
      const paramValue = productParam.attributes.parameter_value.data;
      const paramValueId = paramValue.id;
      const paramValueText = paramValue.attributes.value;
      const paramTypeName =
        paramValue.attributes.parameter_type.data.attributes.name;

      // Получаем ID локализации значения параметра для целевого языка
      const localizedParamValueId = await getParameterValueLocalization(
        paramValueId,
        targetLocale
      );

      if (!localizedParamValueId) {
        console.log(
          `⚠ Skipping parameter "${paramTypeName}: ${paramValueText}" - no ${targetLocale} localization`
            .yellow
        );
        productSkippedCount++;
        continue;
      }

      // Проверяем, существует ли уже такая связь
      if (existingParameterValueIds.includes(localizedParamValueId)) {
        console.log(
          `ℹ Parameter "${paramTypeName}: ${paramValueText}" already linked to product in ${targetLocale} locale`
            .blue
        );
        productAlreadyExistsCount++;
        continue;
      }

      try {
        // Создаем связь между локализованным продуктом и локализованным значением параметра
        const result = await createProductParameter(
          localizedProductId,
          localizedParamValueId,
          targetLocale
        );

        if (result.id === "already_exists") {
          console.log(
            `ℹ Parameter "${paramTypeName}: ${paramValueText}" already linked to product in ${targetLocale} locale`
              .blue
          );
          productAlreadyExistsCount++;
        } else {
          console.log(
            `✓ Linked parameter "${paramTypeName}: ${paramValueText}" to product in ${targetLocale} locale`
              .green
          );
          productSuccessCount++;
        }
      } catch (error) {
        console.error(
          `✗ Failed to link parameter "${paramTypeName}: ${paramValueText}" to product in ${targetLocale} locale`
            .red,
          error
        );
        productErrorCount++;
      }
    }

    // Обновляем общую статистику
    successCount += productSuccessCount;
    errorCount += productErrorCount;
    skippedCount += productSkippedCount;
    alreadyExistsCount += productAlreadyExistsCount;

    console.log(`\nProduct "${productTitle}" summary:`.cyan);
    console.log(`✓ Successfully linked: ${productSuccessCount}`.green);
    console.log(`ℹ Already existed: ${productAlreadyExistsCount}`.blue);
    console.log(`⚠ Skipped: ${productSkippedCount}`.yellow);
    console.log(`✗ Failed: ${productErrorCount}`.red);

    // Выводим общий прогресс каждые 10 продуктов
    if (processedProducts % 10 === 0 || processedProducts === totalProducts) {
      console.log(
        `\n--- Progress: ${processedProducts}/${totalProducts} products (${Math.round(
          (processedProducts / totalProducts) * 100
        )}%) ---`.blue
      );
      console.log(`✓ Total successfully linked: ${successCount}`.green);
      console.log(`ℹ Total already existed: ${alreadyExistsCount}`.blue);
      console.log(`⚠ Total skipped: ${skippedCount}`.yellow);
      console.log(`✗ Total failed: ${errorCount}`.red);
      console.log("---------------------------------------------------");
    }
  }

  console.log(`\nSynchronization complete:`.blue);
  console.log(`✓ Successfully linked: ${successCount}`.green);
  console.log(`ℹ Already existed: ${alreadyExistsCount}`.blue);
  console.log(`⚠ Skipped: ${skippedCount}`.yellow);
  console.log(`✗ Failed: ${errorCount}`.red);

  return { successCount, errorCount, skippedCount, alreadyExistsCount };
}

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

async function compareProductParameters() {
  try {
    console.log("Fetching products with their parameters...".blue);

    const ukProducts = await getProductsWithParameters("uk");
    const ruProducts = await getProductsWithParameters("ru");

    console.log(`\nUkrainian products: ${ukProducts.length}`.cyan);
    console.log(`Russian products: ${ruProducts.length}`.cyan);

    // Анализируем разницу в количестве параметров между локализациями
    let ukTotalParams = 0;
    let ruTotalParams = 0;

    ukProducts.forEach((product) => {
      ukTotalParams += product.attributes.product_parameters.data.length;
    });

    ruProducts.forEach((product) => {
      ruTotalParams += product.attributes.product_parameters.data.length;
    });

    console.log(
      `\nTotal parameter links in Ukrainian products: ${ukTotalParams}`.cyan
    );
    console.log(
      `Total parameter links in Russian products: ${ruTotalParams}`.cyan
    );

    const difference = Math.abs(ukTotalParams - ruTotalParams);
    const percentDifference = (
      (difference / Math.max(ukTotalParams, ruTotalParams)) *
      100
    ).toFixed(2);

    console.log(
      `\nDifference in parameter links: ${difference} (${percentDifference}%)`
        .yellow
    );

    // Находим продукты с разным количеством параметров в разных локализациях
    const ukProductsMap = new Map();
    const ruProductsMap = new Map();

    ukProducts.forEach((product) => {
      ukProductsMap.set(product.attributes.part_number, {
        id: product.id,
        paramCount: product.attributes.product_parameters.data.length,
        title: product.attributes.title,
      });
    });

    ruProducts.forEach((product) => {
      ruProductsMap.set(product.attributes.part_number, {
        id: product.id,
        paramCount: product.attributes.product_parameters.data.length,
        title: product.attributes.title,
      });
    });

    const productsWithDifferentParamCounts = [];

    ukProductsMap.forEach((ukProduct, partNumber) => {
      const ruProduct = ruProductsMap.get(partNumber);
      if (ruProduct && ukProduct.paramCount !== ruProduct.paramCount) {
        productsWithDifferentParamCounts.push({
          part_number: partNumber,
          uk_title: ukProduct.title,
          uk_id: ukProduct.id,
          uk_params: ukProduct.paramCount,
          ru_title: ruProduct.title,
          ru_id: ruProduct.id,
          ru_params: ruProduct.paramCount,
          difference: Math.abs(ukProduct.paramCount - ruProduct.paramCount),
        });
      }
    });

    // Сортируем по разнице в количестве параметров (по убыванию)
    productsWithDifferentParamCounts.sort(
      (a, b) => b.difference - a.difference
    );

    console.log(
      `\nFound ${productsWithDifferentParamCounts.length} products with different parameter counts in UK and RU localizations`
        .yellow
    );

    if (productsWithDifferentParamCounts.length > 0) {
      console.log(
        "\nTop 10 products with biggest difference in parameter counts:".yellow
      );
      productsWithDifferentParamCounts.slice(0, 10).forEach((product) => {
        console.log(
          `  - "${product.uk_title}" (${product.part_number}): UK: ${product.uk_params}, RU: ${product.ru_params}, Diff: ${product.difference}`
        );
      });
    }

    // Предлагаем синхронизировать параметры продуктов
    if (difference > 0 || productsWithDifferentParamCounts.length > 0) {
      const answer = await askQuestion(
        "\nХотите синхронизировать параметры продуктов между локализациями? (Y/n): "
          .green
      );

      if (answer.toLowerCase() !== "n") {
        // Спрашиваем, в каком направлении синхронизировать
        const directionAnswer = await askQuestion(
          `\nВ каком направлении синхронизировать параметры?\n` +
            `1. С украинского на русский (копировать параметры с UK на RU)\n` +
            `2. С русского на украинский (копировать параметры с RU на UK)\n` +
            `3. В обоих направлениях (сначала UK->RU, затем RU->UK)\n` +
            `Выберите (1/2/3): `.green
        );

        if (directionAnswer === "1" || directionAnswer === "3") {
          console.log(
            "\nСинхронизация параметров с украинского на русский...".cyan
          );
          await syncProductParameters(ukProducts, "uk", "ru");
        }

        if (directionAnswer === "2" || directionAnswer === "3") {
          console.log(
            "\nСинхронизация параметров с русского на украинский...".cyan
          );
          await syncProductParameters(ruProducts, "ru", "uk");
        }

        console.log(
          "\nСинхронизация завершена. Запустите скрипт снова, чтобы проверить результаты."
            .green.bold
        );
      } else {
        console.log("Синхронизация отменена.".yellow);
      }
    } else {
      console.log(
        "\nКоличество связей параметров одинаково в обеих локализациях. Синхронизация не требуется."
          .green
      );
    }
  } catch (error) {
    console.error("Error comparing product parameters:".red, error);
  }
}

compareProductParameters();
