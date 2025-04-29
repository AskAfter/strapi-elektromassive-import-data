import "../../config/config.js";
import "colors";
import axios from "axios";
import readline from "readline";
import { cleanString, translateText } from "../../utils/translation.js";

const axiosInstance = axios.create({
  baseURL: `${process.env.STRAPI_URL}/graphql`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
  },
});

async function getAllParameterValues(locale) {
  const query = `
    query GetAllParameterValues($locale: I18NLocaleCode!, $pagination: PaginationArg) {
      parameterValues(locale: $locale, pagination: $pagination) {
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

  const pageSize = 100;
  let page = 1;
  let allValues = [];
  let hasMorePages = true;

  while (hasMorePages) {
    console.log(
      `Fetching parameter values for locale "${locale}", page ${page}...`
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

      const values = data.data.parameterValues.data;
      allValues = [...allValues, ...values];

      const { total, pageCount } = data.data.parameterValues.meta.pagination;

      console.log(
        `Fetched ${values.length} values. Total: ${allValues.length}/${total}`
      );

      if (page >= pageCount) {
        hasMorePages = false;
      } else {
        page++;
      }
    } catch (error) {
      console.error(`Error fetching parameter values:`, error);
      hasMorePages = false;
    }
  }

  return allValues;
}

async function getParameterTypeLocalization(parameterTypeId, targetLocale) {
  const query = `
    query GetParameterType($id: ID!) {
      parameterType(id: $id) {
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
    id: parameterTypeId,
  };

  try {
    const { data } = await axiosInstance.post("", { query, variables });
    const localizations =
      data.data.parameterType.data.attributes.localizations.data;
    const targetLocalization = localizations.find(
      (loc) => loc.attributes.locale === targetLocale
    );

    return targetLocalization ? targetLocalization.id : null;
  } catch (error) {
    console.error(`Error getting parameter type localization:`, error);
    return null;
  }
}

async function createParameterValueLocalization(
  parameterValueId,
  locale,
  code,
  value,
  parameterTypeLocalizationId
) {
  const mutation = `
    mutation CreateParameterValueLocalization($id: ID!, $locale: I18NLocaleCode!, $data: ParameterValueInput!) {
      createParameterValueLocalization(id: $id, locale: $locale, data: $data) {
        data {
          id
          attributes {
            locale
            value
          }
        }
      }
    }
  `;

  const variables = {
    id: parameterValueId,
    locale,
    data: {
      code,
      value,
      parameter_type: parameterTypeLocalizationId,
      publishedAt: new Date().toISOString(),
    },
  };

  try {
    const { data } = await axiosInstance.post("", {
      query: mutation,
      variables,
    });

    return data.data.createParameterValueLocalization.data;
  } catch (error) {
    console.log(
      `Error creating parameter value localization for ${value}:`.red,
      error
    );
    throw error;
  }
}

async function syncParameterValueLocalizations(
  valuesToSync,
  sourceLocale,
  targetLocale
) {
  console.log(
    `\nStarting synchronization of ${valuesToSync.length} parameter values from ${sourceLocale} to ${targetLocale}...`
      .blue
  );

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (const [index, value] of valuesToSync.entries()) {
    try {
      const sourceValue = value.attributes.value;
      const sourceCode = value.attributes.code;
      const parameterTypeId = value.attributes.parameter_type.data.id;
      const parameterTypeName =
        value.attributes.parameter_type.data.attributes.name;

      // Получаем ID локализации типа параметра для целевого языка
      const parameterTypeLocalizationId = await getParameterTypeLocalization(
        parameterTypeId,
        targetLocale
      );

      if (!parameterTypeLocalizationId) {
        console.log(
          `⚠ Skipping value "${sourceValue}" because parameter type "${parameterTypeName}" has no ${targetLocale} localization`
            .yellow
        );
        skippedCount++;
        continue;
      }

      // Переводим значение с помощью GPT, указывая целевой язык
      console.log(
        `Translating "${sourceValue}" from ${sourceLocale} to ${targetLocale}...`
          .cyan
      );

      let targetValue;

      // Проверяем, нужно ли переводить значение
      if (
        typeof sourceValue === "string" &&
        (/^[\d\.,\-\+\s]+$/.test(sourceValue) ||
          /^\d+([.,]\d+)?\s*(мм|м|см|кг|г|°C|%|л)$/i.test(sourceValue) ||
          /[a-zA-Z]/.test(sourceValue))
      ) {
        // Числовые значения, единицы измерения и латинские символы не переводим
        targetValue = sourceValue;
        console.log(
          `Keeping original value for "${sourceValue}" (numeric/unit/latin)`
            .cyan
        );
      } else {
        // Переводим текстовые значения
        const translated = await translateText(sourceValue, targetLocale);
        targetValue = cleanString(translated);
        console.log(`Translated "${sourceValue}" to "${targetValue}"`.cyan);
      }

      console.log(
        `[${index + 1}/${
          valuesToSync.length
        }] Creating ${targetLocale} localization for "${sourceValue}" (ID: ${
          value.id
        })`.cyan
      );

      const result = await createParameterValueLocalization(
        value.id,
        targetLocale,
        sourceCode,
        targetValue,
        parameterTypeLocalizationId
      );

      console.log(
        `✓ Created ${targetLocale} localization: "${result.attributes.value}"`
          .green
      );
      successCount++;
    } catch (error) {
      console.error(
        `✗ Failed to create localization for value ID ${value.id}:`.red,
        error.message || error
      );
      errorCount++;
    }

    // Небольшая пауза, чтобы не перегружать API
    if (index < valuesToSync.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Каждые 50 значений выводим промежуточную статистику
    if ((index + 1) % 50 === 0 || index === valuesToSync.length - 1) {
      console.log(
        `\nProgress: ${index + 1}/${valuesToSync.length} (${Math.round(
          ((index + 1) / valuesToSync.length) * 100
        )}%)`.blue
      );
      console.log(`✓ Success: ${successCount}`.green);
      console.log(`⚠ Skipped: ${skippedCount}`.yellow);
      console.log(`✗ Failed: ${errorCount}`.red);
      console.log("---------------------------------------------------");
    }
  }

  console.log(`\nSynchronization complete:`.blue);
  console.log(`✓ Successfully created: ${successCount}`.green);
  console.log(`⚠ Skipped: ${skippedCount}`.yellow);
  console.log(`✗ Failed: ${errorCount}`.red);

  return { successCount, errorCount, skippedCount };
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

async function compareParameterValues() {
  try {
    const ukValues = await getAllParameterValues("uk");
    const ruValues = await getAllParameterValues("ru");

    console.log(`Ukrainian parameter values: ${ukValues.length}`.cyan);
    console.log(`Russian parameter values: ${ruValues.length}`.cyan);

    // Находим значения параметров, которые есть в русской локализации, но не имеют украинской локализации
    const ruValuesWithoutUk = ruValues.filter(
      (value) =>
        !value.attributes.localizations.data.some(
          (loc) => loc.attributes.locale === "uk"
        )
    );

    console.log(
      `\nParameter values only in Russian (no Ukrainian localization): ${ruValuesWithoutUk.length}`
        .yellow
    );

    if (ruValuesWithoutUk.length > 0) {
      console.log("Sample of Russian-only parameter values:".yellow);
      ruValuesWithoutUk.slice(0, 10).forEach((value) => {
        const paramTypeName =
          value.attributes.parameter_type.data.attributes.name;
        console.log(
          `  - ID: ${value.id}, Value: "${value.attributes.value}", Type: "${paramTypeName}"`
        );
      });
    }

    // Находим значения параметров, которые есть в украинской локализации, но не имеют русской локализации
    const ukValuesWithoutRu = ukValues.filter(
      (value) =>
        !value.attributes.localizations.data.some(
          (loc) => loc.attributes.locale === "ru"
        )
    );

    console.log(
      `\nParameter values only in Ukrainian (no Russian localization): ${ukValuesWithoutRu.length}`
        .yellow
    );

    if (ukValuesWithoutRu.length > 0) {
      console.log("Sample of Ukrainian-only parameter values:".yellow);
      ukValuesWithoutRu.slice(0, 10).forEach((value) => {
        const paramTypeName =
          value.attributes.parameter_type.data.attributes.name;
        console.log(
          `  - ID: ${value.id}, Value: "${value.attributes.value}", Type: "${paramTypeName}"`
        );
      });
    }

    // Предлагаем синхронизировать локализации
    if (ruValuesWithoutUk.length > 0 || ukValuesWithoutRu.length > 0) {
      const answer = await askQuestion(
        "\nХотите синхронизировать локализации значений параметров? (Y/n): "
          .green
      );

      if (answer.toLowerCase() !== "n") {
        // Спрашиваем, какие локализации синхронизировать
        if (ruValuesWithoutUk.length > 0 && ukValuesWithoutRu.length > 0) {
          const directionAnswer = await askQuestion(
            `\nКакие локализации синхронизировать?\n` +
              `1. Только с русского на украинский (${ruValuesWithoutUk.length} значений)\n` +
              `2. Только с украинского на русский (${ukValuesWithoutRu.length} значений)\n` +
              `3. Обе (${
                ruValuesWithoutUk.length + ukValuesWithoutRu.length
              } значений)\n` +
              `Выберите (1/2/3): `.green
          );

          if (directionAnswer === "1" || directionAnswer === "3") {
            console.log(
              "\nСинхронизация русских значений параметров с украинской локализацией..."
                .cyan
            );
            await syncParameterValueLocalizations(
              ruValuesWithoutUk,
              "ru",
              "uk"
            );
          }

          if (directionAnswer === "2" || directionAnswer === "3") {
            console.log(
              "\nСинхронизация украинских значений параметров с русской локализацией..."
                .cyan
            );
            await syncParameterValueLocalizations(
              ukValuesWithoutRu,
              "uk",
              "ru"
            );
          }
        } else if (ruValuesWithoutUk.length > 0) {
          console.log(
            "\nСинхронизация русских значений параметров с украинской локализацией..."
              .cyan
          );
          await syncParameterValueLocalizations(ruValuesWithoutUk, "ru", "uk");
        } else if (ukValuesWithoutRu.length > 0) {
          console.log(
            "\nСинхронизация украинских значений параметров с русской локализацией..."
              .cyan
          );
          await syncParameterValueLocalizations(ukValuesWithoutRu, "uk", "ru");
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
        "\nВсе значения параметров имеют локализации на обоих языках. Синхронизация не требуется."
          .green
      );
    }
  } catch (error) {
    console.error("Error comparing parameter values:".red, error);
  }
}

compareParameterValues();
