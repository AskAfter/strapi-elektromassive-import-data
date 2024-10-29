import slugify from "slugify";
import transliterate from "transliterate";
import axios from "axios";

import { TranslationServiceClient } from "@google-cloud/translate";

import "../config/config.js";

const axiosInstance = axios.create({
  baseURL: `${process.env.STRAPI_URL}/graphql`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
  },
});

const translationClient = new TranslationServiceClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

async function translateText(text, targetLanguage) {
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    const location = "global";

    const request = {
      parent: `projects/${projectId}/locations/${location}`,
      contents: [text],
      mimeType: "text/plain",
      sourceLanguageCode: "uk",
      targetLanguageCode: targetLanguage,
    };

    const [response] = await translationClient.translateText(request);
    return response.translations[0].translatedText;
  } catch (error) {
    console.error("Error translating text:", error);
    return error;
  }
}

async function getProduct(productId) {
  const query = `
    query GetProduct($id: ID!) {
      product(id: $id, locale: "uk") {
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
              }
            }
            product_types {
              data {
                id
              }
            }
            discount
            salesCount
            cart_items {
              data {
                id
              }
            }
            description
            favorite_products {
              data {
                id
              }
            }
            localizations{
              data{
                id
                attributes{
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
    const response = await axiosInstance.post("", {
      query,
      variables: { id: productId },
    });
    return response.data.data.product.data;
  } catch (error) {
    console.error("Error fetching product:", error);
    throw error;
  }
}

async function updateProduct(productId, translatedData) {
  const mutation = `
    mutation CreateProductLocalization(
      $id: ID!
      $locale: I18NLocaleCode!
      $data: ProductInput!
    ) {
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
        data: translatedData,
      },
    });
    return response.data.data.createProductLocalization.data;
  } catch (error) {
    console.error("Error updating product:", error);
    throw error;
  }
}

async function translateProduct(productId) {
  try {
    console.log(`Translating product ${productId}...`.blue);

    const product = await getProduct(productId);

    const { attributes } = product;

    const hasRussianLocalization = attributes.localizations.data.some(
      (loc) => loc.attributes.locale === "ru"
    );

    if (hasRussianLocalization) {
      console.log(
        `Russian localization already exists for product ${productId}. Skipping.`
          .yellow
      );
      return;
    }

    const translatedTitle = await translateText(attributes.title, "ru");
    const translatedDescription = attributes.description
      ? await translateText(attributes.description, "ru")
      : "";

    let translatedParams = {};
    if (attributes.params) {
      for (const [key, value] of Object.entries(attributes.params)) {
        const translatedKey = await translateText(key, "ru");

        const containsLatin = /[a-zA-Z]/.test(value);
        const translatedValue = containsLatin
          ? value
          : await translateText(value, "ru");

        translatedParams[translatedKey] = translatedValue;
      }
    }

    const translatedSlug = slugify(transliterate(translatedTitle), {
      lower: true,
      strict: true,
    });

    const translatedData = {
      title: translatedTitle,
      part_number: attributes.part_number,
      retail: attributes.retail,
      image_link: attributes.image_link,
      currency: attributes.currency,
      additional_images: attributes?.additional_images,
      // product_types: attributes.product_types?.data?.map((pt) => pt.id),
      // subcategory: attributes.subcategory?.data?.id,
      discount: attributes.discount,
      // cart_items: attributes.cart_items?.data?.map((ci) => ci.id),
      salesCount: attributes.salesCount,
      // favorite_products: attributes.favorite_products?.data?.map((fp) => fp.id),
      description: translatedDescription,
      params: translatedParams,
      slug: `${translatedSlug}-ru`,
      publishedAt: new Date().toISOString(),
    };

    console.log(`Translated product ${productId} successfully!`.green);

    await updateProduct(productId, translatedData);

    console.log(`Updated product ${productId} with Russian translation`.cyan);
  } catch (error) {
    console.error("Error fetching or translating product:", error);
  }
}

async function translateAllProducts() {
  try {
    let page = 1;
    let totalProducts = 0;
    const pageSize = 20;

    while (true) {
      console.log(`Fetching page ${page}...`.cyan);

      const query = `
        query GetProducts($page: Int!, $pageSize: Int!) {
          products(pagination: { page: $page, pageSize: $pageSize }, locale: "uk") {
            data {
              id
            }
            meta {
              pagination {
                total
                pageCount
              }
            }
          }
        }
      `;

      const response = await axiosInstance.post("", {
        query,
        variables: { page, pageSize },
      });

      const { data, meta } = response.data.data.products;

      for (const product of data) {
        await translateProduct(product.id);
        totalProducts++;
      }

      console.log(`Processed ${totalProducts} products so far...`.cyan);

      if (!meta.pagination.pageCount || page >= meta.pagination.pageCount) {
        break; // No more pages to process
      }

      page++;
    }
    console.log(`All products updated successfully: ${totalProducts}`.green);
  } catch (error) {
    console.log(error);
  }
}

translateAllProducts();
