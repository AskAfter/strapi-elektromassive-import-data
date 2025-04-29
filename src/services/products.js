import { DEFAULT_LOCALE } from "../index.js";
import axiosInstance from "../api/axiosInstance.js";

import "../../config/config.js";

async function getProduct(partNumber, locale) {
  const query = `
    query GetProductByPartNumber($partNumber: String!, $locale: I18NLocaleCode!) {
      products(filters: { part_number: { eq: $partNumber } }, locale: $locale) {
        data {
          id
          attributes {
            id
          }
        }
      }
    }
  `;

  try {
    const response = await axiosInstance.post("", {
      query,
      variables: { partNumber, locale },
    });
    return response.data.data.products.data[0];
  } catch (error) {
    console.error("Error fetching product:", error);
    throw error;
  }
}

const updateProduct = async (id, product, locale) => {
  const query = `
    mutation UpdateProduct($id: ID!, $data: ProductInput!, $locale: I18NLocaleCode!) {
      updateProduct(id: $id, data: $data, locale: $locale) {
        data {
          id
        }
      }
    }
  `;

  try {
    const response = await axiosInstance.post("", {
      query,
      variables: { id, data: product, locale },
    });
    return response.data.data.updateProduct.data;
  } catch (error) {
    console.error("Error updating product:", error);
    throw error;
  }
};

async function createProduct(product, locale) {
  const query = `
    mutation CreateProduct($data: ProductInput!, $locale: I18NLocaleCode!) {
      createProduct(data: $data, locale: $locale) {
        data {
          id
        }
      }
    }
  `;

  try {
    const response = await axiosInstance.post("", {
      query,
      variables: { data: product, locale },
    });
    return response.data.data.createProduct.data;
  } catch (error) {
    console.error("Error creating product:", error);
    throw error;
  }
}

async function getProductsFromStrapi(locale = DEFAULT_LOCALE, pageSize = 100) {
  let allProducts = [];
  let page = 1;
  let hasMoreProducts = true;

  console.log(`Fetching products from Strapi with page size ${pageSize}`.blue);

  while (hasMoreProducts) {
    const query = `
      query GetProducts($locale: I18NLocaleCode!, $page: Int!, $pageSize: Int!) {
        products(locale: $locale, pagination: { page: $page, pageSize: $pageSize }) {
          data {
            id
            attributes {
              title
              part_number
              params
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

    try {
      console.log(`Fetching page ${page}...`.gray);
      const response = await axiosInstance.post("", {
        query,
        variables: { locale, page, pageSize },
      });

      const products = response.data?.data?.products?.data || [];
      const pagination = response.data?.data?.products?.meta?.pagination;

      if (products.length === 0) {
        hasMoreProducts = false;
      } else {
        allProducts = [...allProducts, ...products];
        console.log(
          `Fetched ${products.length} products from page ${page}. Total so far: ${allProducts.length}`
            .green
        );

        // Проверяем, есть ли еще страницы
        if (pagination && page >= pagination.pageCount) {
          hasMoreProducts = false;
          console.log(
            `Reached last page. Total products: ${pagination.total}`.green
          );
        } else {
          page++;
        }
      }
    } catch (error) {
      console.error(
        `Error fetching products from Strapi (page ${page}):`.red,
        error
      );
      hasMoreProducts = false; // Прекращаем попытки при ошибке
    }
  }

  console.log(`Total products fetched: ${allProducts.length}`.blue.bold);
  return allProducts;
}

async function getProductLocalization(productId, locale = DEFAULT_LOCALE) {
  const query = `
    query GetProductLocalization($id: ID!, $locale: String!) {
      product(id: $id) {
        data {
          attributes {
            localizations(filters: { locale: { eq: $locale } }) {
              data {
                id
              }
            }
          }
        }
      }
    }
  `;

  try {
    const { data } = await axiosInstance.post("", {
      query,
      variables: { id: productId, locale },
    });

    const localizations = data.data.product.data.attributes.localizations.data;
    return localizations.length > 0 ? localizations[0] : null;
  } catch (error) {
    console.error(`Error getting product localization:`.red, error);
    return null;
  }
}

export {
  getProduct,
  updateProduct,
  createProduct,
  getProductLocalization,
  getProductsFromStrapi,
};
