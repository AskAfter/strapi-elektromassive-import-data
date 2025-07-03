import "../config/config.js";
import axiosInstance from "./api/axiosInstance.js";

async function fetchAllRelatedProducts(typeId) {
  const query = `
    query GetProductTypeWithProducts($id: ID!, $start: Int!, $limit: Int!) {
      productType(id: $id) {
        data {
          id
          attributes {
            title
            products(pagination: { start: $start, limit: $limit }) {
              data {
                id
              }
            }
          }
        }
      }
    }
  `;

  let allProductIds = [];
  let start = 0;
  const limit = 10; //TODO: DO NOT CHANGE THE LIMIT

  try {
    while (true) {
      const response = await axiosInstance.post("", {
        query,
        variables: { id: typeId, start, limit },
      });

      const productType = response.data.data.productType.data;
      const products = productType.attributes.products.data;

      if (products.length === 0) break; // No more products to fetch

      allProductIds = [
        ...allProductIds,
        ...products.map((product) => product.id),
      ];

      // console.log(
      //   `Fetched ${products.length} products. Total: ${allProductIds.length}`
      // );

      start += limit;
    }

    console.log(`Total products fetched: ${allProductIds.length}`);
    return allProductIds;
  } catch (error) {
    console.error("Error fetching products:", error.message);
  }
}

async function updateProductRelations() {
  const startId = 16919; //TODO: change the product ids after creating it
  const endId = 16923; //TODO: change the product ids after creating it

  const productIds = Array.from(
    { length: endId - startId + 1 },
    (_, i) => `${startId + i}`
  );

  const mutation = `
    mutation UpdateProductType($id: ID!, $productIds: [ID]) {
      updateProductType(id: $id, data: { products: $productIds }) {
        data {
          id
          attributes {
            title
            products {
              data {
                id
              }
            }
          }
        }
      }
    }
  `;

  const PRODUCT_TYPE_ID = 12; //TODO: change the product type id

  try {
    // Fetch all current product relations
    const currentProductIds = await fetchAllRelatedProducts(PRODUCT_TYPE_ID);

    // Combine current and new product IDs, removing duplicates
    const updatedProductIds = [
      ...new Set([...currentProductIds, ...productIds]),
    ];

    // Update product relations
    await axiosInstance.post("", {
      query: mutation,
      variables: {
        id: PRODUCT_TYPE_ID,
        productIds: updatedProductIds,
      },
    });

    const updatedProducts = await fetchAllRelatedProducts(PRODUCT_TYPE_ID);

    console.log("Updated product relations:", updatedProducts);

    console.log(`Total products after update: ${updatedProducts.length}`);

    return updatedProducts.map((product) => product.id);
  } catch (error) {
    console.error("Error updating product relations:", error.message);
    throw error;
  }
}

updateProductRelations().catch((error) => {
  console.error("Failed to update product relations:", error);
});
