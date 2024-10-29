import axios from "axios";
import "../config/config.js";

const axiosInstance = axios.create({
  baseURL: `${process.env.STRAPI_URL}/graphql`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
  },
});

// Получаем связи для товара на украинском языке
async function getUkrainianProductRelations(productId) {
  const query = `
    query GetProductRelations($id: ID!) {
      product(id: $id, locale: "uk") {
        data {
          attributes {
            product_types {
              data {
                id
                attributes {
                  title
                  localizations {
                    data {
                      id
                      attributes {
                        locale
                        title
                      }
                    }
                  }
                }
              }
            }
            subcategory {
              data {
                id
                attributes {
                  title
                  localizations {
                    data {
                      id
                      attributes {
                        locale
                        title
                      }
                    }
                  }
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
    return response.data.data.product.data.attributes;
  } catch (error) {
    console.error("Error fetching Ukrainian product relations:", error);
    throw error;
  }
}

// Обновляем связи для товара на русском языке
async function updateProductRelations(productId, productTypes, subcategory) {
  const mutation = `
    mutation UpdateProduct($id: ID!, $data: ProductInput!) {
      updateProduct(id: $id, data: $data) {
        data {
          id
        }
      }
    }
  `;

  try {
    const response = await axiosInstance.post("", {
      query: mutation,
      variables: {
        id: productId,
        data: {
          product_types: productTypes,
          subcategory: subcategory,
        },
      },
    });
    return response.data.data.updateProduct.data;
  } catch (error) {
    console.error("Error updating product relations:", error);
    throw error;
  }
}

// Получаем все  товары на русском языке
async function getRussianProducts(page = 1, pageSize = 20) {
  const query = `
    query GetRussianProducts($page: Int!, $pageSize: Int!) {
      products(
        locale: "ru"
        pagination: { page: $page, pageSize: $pageSize }
      ) {
        data {
          id
          attributes {
            locale
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
            pageCount
          }
        }
      }
    }
  `;

  try {
    const response = await axiosInstance.post("", {
      query,
      variables: { page, pageSize },
    });
    return response.data.data.products;
  } catch (error) {
    console.error("Error fetching products in Russian:", error);
    throw error;
  }
}

async function updateAllProductRelations() {
  try {
    let page = 1;
    let totalProducts = 0;
    const pageSize = 20;

    while (true) {
      console.log(`Fetching page ${page} of products in Russian...`.cyan);

      const { data: russianProducts, meta } = await getRussianProducts(
        page,
        pageSize
      );

      for (const russianProduct of russianProducts) {
        // Находим ID товара на украинском языке
        const ukrainianProduct =
          russianProduct.attributes.localizations.data.find(
            (loc) => loc.attributes.locale === "uk"
          );

        if (!ukrainianProduct) {
          console.log(
            `No Ukrainian version found for product in Russian ${russianProduct.id}`
              .yellow
          );
          continue;
        }

        // Получаем связи товара на украинском языке
        const ukrainianRelations = await getUkrainianProductRelations(
          ukrainianProduct.id
        );

        // Находим аналоги для product_types на русском языке
        const russianProductTypes = ukrainianRelations.product_types.data
          .map((pt) => {
            const russianVersion = pt.attributes.localizations.data.find(
              (loc) => loc.attributes.locale === "ru"
            );
            return russianVersion ? russianVersion.id : null;
          })
          .filter(Boolean);

        // Находим аналог на русском языке для subcategory
        let russianSubcategory = null;
        if (ukrainianRelations.subcategory.data) {
          const russianVersion =
            ukrainianRelations.subcategory.data.attributes.localizations.data.find(
              (loc) => loc.attributes.locale === "ru"
            );
          russianSubcategory = russianVersion ? russianVersion.id : null;
        }

        // Обновляем товар на русском языке
        await updateProductRelations(
          russianProduct.id,
          russianProductTypes,
          russianSubcategory
        );

        console.log(
          `Updated relations for product in Russian ${russianProduct.id}`.green
        );

        totalProducts++;
      }

      console.log(`Processed ${totalProducts} products so far...`.cyan);

      if (!meta.pagination.pageCount || page >= meta.pagination.pageCount) {
        break;
      }

      page++;
    }

    console.log(
      `All product relations updated successfully: ${totalProducts}`.green
    );
  } catch (error) {
    console.error("Error updating product relations:", error);
  }
}

updateAllProductRelations();
