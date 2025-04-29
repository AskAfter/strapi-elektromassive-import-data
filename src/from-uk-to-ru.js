import slugify from "slugify";
import transliterate from "transliterate";
import axios from "axios";
import { products } from "../data/products.js"; // Если products.js экспортирует через: export const products = [...];

import "../config/config.js";

const axiosInstance = axios.create({
  baseURL: `${process.env.STRAPI_URL}/graphql`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
  },
});

/**
 * Поиск продукта по part_number в Strapi (locale "uk").
 */
async function getProductByPartNumber(partNumber) {
  const query = `
    query GetProductByPartNumber($part_number: String!) {
      products(filters: { part_number: { eq: $part_number } }, locale: "uk") {
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
                  localizations(filters: { locale: { eq: "ru" } }) {
                    data {
                      id
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
      }
    }
  `;
  try {
    console.log(
      `Поиск продукта с part_number: "${partNumber}" в Strapi...`.cyan
    );
    const response = await axiosInstance.post("", {
      query,
      variables: { part_number: partNumber },
    });
    const productsFound = response.data.data.products.data;
    if (!productsFound || productsFound.length === 0) {
      throw new Error(
        `Продукт с part_number "${partNumber}" не найден в Strapi.`
      );
    }
    console.log(
      `Продукт с part_number "${partNumber}" найден. ID: ${productsFound[0].id}`
        .green
    );
    return productsFound[0];
  } catch (error) {
    console.error("Ошибка получения продукта по part_number:", error);
    throw error;
  }
}

/**
 * Обновление (создание локализации) продукта в Strapi.
 */
async function updateProduct(productId, localizationData) {
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
      `Обновление продукта с ID: ${productId} для локали "ru"...`.cyan
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
    console.log(`Продукт с ID: ${productId} успешно обновлён.`);
    return localization.data;
  } catch (error) {
    console.error("Ошибка обновления продукта:", error.response?.data || error);
    throw error;
  }
}

/**
 * Перевод продукта и создание его русской локализации.
 */
async function translateProduct(product) {
  try {
    console.log(
      `Начинаю перевод продукта с part_number "${product.part_number}"...`
    );
    const originalProduct = await getProductByPartNumber(product.part_number);

    // Если русская локализация уже существует – пропускаем
    const hasRussianLocalization =
      originalProduct.attributes.localizations.data.some(
        (loc) => loc.attributes.locale === "ru"
      );
    if (hasRussianLocalization) {
      console.log(
        `Русская локализация для продукта "${product.part_number}" уже существует. Пропускаю.`
      );
      return;
    }

    // Перевод локализуемых полей
    const translatedTitle = await translateText(product.title, "ru");
    const translatedDescription = product.description
      ? await translateText(product.description, "ru")
      : "";

    const translatedSlug = slugify(transliterate(translatedTitle), {
      lower: true,
      strict: true,
    });

    // Получаем оригинальные поля продукта
    const original = originalProduct.attributes;

    // Формируем объект локализации, включающий переведённые поля и обязательные поля из оригинала.
    const localizationData = {
      title: translatedTitle,
      description: translatedDescription,
      slug: `${translatedSlug}-ru`,
      publishedAt: new Date().toISOString(),
      part_number: original.part_number,
      retail: original.retail,
      image_link: original.image_link,
      currency: original.currency,
      product_types:
        original.product_types?.data?.map(
          (pt) => pt.attributes?.localizations?.data?.find((loc) => loc.id)?.id
        ) || [],
      product_parameters:
        original.product_parameters?.data?.map(
          (pp) => pp.attributes?.localizations?.data?.find((loc) => loc.id)?.id
        ) || [],
      subcategory:
        original.subcategory?.data?.attributes?.localizations?.data?.find(
          (loc) => loc.id
        )?.id || null,
      discount: original.discount,
      salesCount: original.salesCount,
    };

    if (original.additional_images !== undefined) {
      localizationData.additional_images = original.additional_images;
    }

    console.log(`Продукт "${product.part_number}" успешно переведён!`);
    await updateProduct(originalProduct.id, localizationData);
    console.log(
      `Обновление продукта "${product.part_number}" с русской локализацией прошло успешно.`
        .magenta
    );
  } catch (error) {
    console.error("Ошибка при переводе продукта:", error);
    process.exit(1);
  }
}

async function translateAllProducts() {
  try {
    console.log("Начало перевода продуктов из products.js".blue.bold);
    for (const product of products) {
      await translateProduct(product);
    }
    console.log("Все продукты успешно обновлены.");
  } catch (error) {
    console.error("Ошибка в процессе перевода продуктов:", error);
    process.exit(1);
  }
}

translateAllProducts();
