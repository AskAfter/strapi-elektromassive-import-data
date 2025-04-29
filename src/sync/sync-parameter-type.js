import { fileURLToPath } from "url";
import { dirname } from "path";
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

async function getAllParameterTypes(locale) {
  const query = `
    query GetAllParameterTypes($locale: I18NLocaleCode!, $pagination: PaginationArg) {
      parameterTypes(locale: $locale, pagination: $pagination) {
        data {
          id
          attributes {
            name
            slug
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
  let allTypes = [];
  let hasMorePages = true;

  while (hasMorePages) {
    console.log(
      `Fetching parameter types for locale "${locale}", page ${page}...`
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

      const types = data.data.parameterTypes.data;
      allTypes = [...allTypes, ...types];

      const { total, pageCount } = data.data.parameterTypes.meta.pagination;

      console.log(
        `Fetched ${types.length} types. Total: ${allTypes.length}/${total}`
      );

      if (page >= pageCount) {
        hasMorePages = false;
      } else {
        page++;
      }
    } catch (error) {
      console.error(`Error fetching parameter types:`, error);
      hasMorePages = false;
    }
  }

  return allTypes;
}

async function createParameterTypeLocalization(
  parameterTypeId,
  locale,
  name,
  slug
) {
  const mutation = `
    mutation CreateParameterTypeLocalization($id: ID!, $locale: I18NLocaleCode!, $data: ParameterTypeInput!) {
      createParameterTypeLocalization(id: $id, locale: $locale, data: $data) {
        data {
          id
          attributes {
            locale
            name
          }
        }
      }
    }
  `;

  const variables = {
    id: parameterTypeId,
    locale,
    data: {
      name,
      slug,
      publishedAt: new Date().toISOString(),
    },
  };

  try {
    const { data } = await axiosInstance.post("", {
      query: mutation,
      variables,
    });

    return data.data.createParameterTypeLocalization.data;
  } catch (error) {
    console.log(
      `Error creating parameter type localization for ${name}:`.red,
      error
    );
    throw error;
  }
}

async function syncParameterTypeLocalizations(
  typesToSync,
  sourceLocale,
  targetLocale
) {
  console.log(
    `\nStarting synchronization of ${typesToSync.length} parameter types from ${sourceLocale} to ${targetLocale}...`
      .blue
  );

  let successCount = 0;
  let errorCount = 0;

  for (const [index, type] of typesToSync.entries()) {
    try {
      const sourceName = type.attributes.name;
      const sourceSlug = type.attributes.slug;

      // Переводим имя с помощью GPT, указывая целевой язык
      console.log(
        `Translating "${sourceName}" from ${sourceLocale} to ${targetLocale}...`
          .cyan
      );
      const translated = await translateText(sourceName, targetLocale);
      let targetName = cleanString(translated);

      // Применяем специальные правила для определенных ключей
      if (
        sourceLocale === "ru" &&
        targetLocale === "uk" &&
        sourceName === "Количество жил"
      ) {
        targetName = "Кількість жив";
      } else if (
        sourceLocale === "uk" &&
        targetLocale === "ru" &&
        sourceName === "Кількість жив"
      ) {
        targetName = "Количество жил";
      }

      console.log(`Translated "${sourceName}" to "${targetName}"`.cyan);

      console.log(
        `[${index + 1}/${
          typesToSync.length
        }] Creating ${targetLocale} localization for "${sourceName}" (ID: ${
          type.id
        })`.cyan
      );

      const result = await createParameterTypeLocalization(
        type.id,
        targetLocale,
        targetName,
        sourceSlug
      );

      console.log(
        `✓ Created ${targetLocale} localization: "${result.attributes.name}"`
          .green
      );
      successCount++;
    } catch (error) {
      console.error(
        `✗ Failed to create localization for type ID ${type.id}:`.red,
        error.message || error
      );
      errorCount++;
    }

    // Небольшая пауза, чтобы не перегружать API
    if (index < typesToSync.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(`\nSynchronization complete:`.blue);
  console.log(`✓ Successfully created: ${successCount}`.green);
  console.log(`✗ Failed: ${errorCount}`.red);

  return { successCount, errorCount };
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

async function compareParameterTypes() {
  try {
    const ukTypes = await getAllParameterTypes("uk");
    const ruTypes = await getAllParameterTypes("ru");

    console.log(`Ukrainian parameter types: ${ukTypes.length}`.cyan);
    console.log(`Russian parameter types: ${ruTypes.length}`.cyan);

    // Находим типы параметров, которые есть в русской локализации, но не имеют украинской локализации

    const ruTypesWithoutUk = ruTypes.filter(
      (type) =>
        !type.attributes.localizations.data.some(
          (loc) => loc.attributes.locale === "uk"
        )
    );

    console.log(
      `\nParameter types only in Russian (no Ukrainian localization): ${ruTypesWithoutUk.length}`
        .yellow
    );

    if (ruTypesWithoutUk.length > 0) {
      console.log("Sample of Russian-only parameter types:".yellow);

      ruTypesWithoutUk.slice(0, 20).forEach((type) => {
        console.log(
          `  - ID: ${type.id}, Name: "${type.attributes.name}", Slug: "${type.attributes.slug}"`
        );
      });
    }

    // Находим типы параметров, которые есть в украинской локализации, но не имеют русской локализации

    const ukTypesWithoutRu = ukTypes.filter(
      (type) =>
        !type.attributes.localizations.data.some(
          (loc) => loc.attributes.locale === "ru"
        )
    );

    console.log(
      `\nParameter types only in Ukrainian (no Russian localization): ${ukTypesWithoutRu.length}`
        .yellow
    );

    if (ukTypesWithoutRu.length > 0) {
      console.log("Sample of Ukrainian-only parameter types:".yellow);

      ukTypesWithoutRu.slice(0, 20).forEach((type) => {
        console.log(
          `  - ID: ${type.id}, Name: "${type.attributes.name}", Slug: "${type.attributes.slug}"`
        );
      });
    }

    // Предлагаем синхронизировать локализации
    if (ruTypesWithoutUk.length > 0 || ukTypesWithoutRu.length > 0) {
      const answer = await askQuestion(
        "\nХотите синхронизировать локализации? (Y/n): ".green
      );

      if (answer.toLowerCase() !== "n") {
        if (ruTypesWithoutUk.length > 0) {
          console.log(
            "\nСинхронизация русских типов параметров с украинской локализацией..."
              .cyan
          );
          await syncParameterTypeLocalizations(ruTypesWithoutUk, "ru", "uk");
        }

        if (ukTypesWithoutRu.length > 0) {
          console.log(
            "\nСинхронизация украинских типов параметров с русской локализацией..."
              .cyan
          );
          await syncParameterTypeLocalizations(ukTypesWithoutRu, "uk", "ru");
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
        "\nВсе типы параметров имеют локализации на обоих языках. Синхронизация не требуется."
          .green
      );
    }
  } catch (error) {
    console.error("Error comparing parameter types:".red, error);
  }
}

compareParameterTypes();
