import slugify from "slugify";
import axios from "axios";

import "../config/config.js";

const axiosInstance = axios.create({
  baseURL: `${process.env.STRAPI_URL}/graphql`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
  },
});

async function getProduct(productId) {
  const query = `
    query GetProduct($id: ID!) {
      product(id: $id, locale: "en") {
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

async function updateProduct(productId, data) {
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
        locale: "uk",
        data: data,
      },
    });
    return response.data.data.createProductLocalization.data;
  } catch (error) {
    console.error("Error updating product:", error);
    throw error;
  }
}

async function copyProductToUkrainian(productId) {
  try {
    console.log(`Copying product ${productId} to Ukrainian locale...`.blue);

    const product = await getProduct(productId);
    const { attributes } = product;

    const hasUkrainianLocalization = attributes.localizations.data.some(
      (loc) => loc.attributes.locale === "uk"
    );

    if (hasUkrainianLocalization) {
      console.log(
        `Ukrainian localization already exists for product ${productId}. Skipping.`
          .yellow
      );
      return;
    }

    const ukrainianSlug = `${attributes.slug}-uk`;

    const ukrainianData = {
      ...attributes,
      slug: ukrainianSlug,
      product_types: attributes.product_types?.data?.map((pt) => pt.id),
      subcategory: attributes.subcategory?.data?.id,
      cart_items: attributes.cart_items?.data?.map((ci) => ci.id),
      favorite_products: attributes.favorite_products?.data?.map((fp) => fp.id),
      publishedAt: new Date().toISOString(),
    };

    delete ukrainianData.localizations;

    await updateProduct(productId, ukrainianData);

    console.log(`Copied product ${productId} to Ukrainian locale`.green);
  } catch (error) {
    console.error("Error copying product:", error);
  }
}

async function copyAllProductsToUkrainian() {
  try {
    let page = 1;
    let totalProducts = 0;
    const pageSize = 20;

    while (true) {
      console.log(`Fetching page ${page}...`.cyan);

      const query = `
        query GetProducts($page: Int!, $pageSize: Int!) {
          products(pagination: { page: $page, pageSize: $pageSize }, locale: "en") {
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
        await copyProductToUkrainian(product.id);
        totalProducts++;
      }

      console.log(`Processed ${totalProducts} products so far...`.cyan);

      if (!meta.pagination.pageCount || page >= meta.pagination.pageCount) {
        break; // No more pages to process
      }

      page++;
    }
    console.log(
      `All products copied to Ukrainian locale: ${totalProducts}`.green
    );
  } catch (error) {
    console.log(error);
  }
}

copyAllProductsToUkrainian();
