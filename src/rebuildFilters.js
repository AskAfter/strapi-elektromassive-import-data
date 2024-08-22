import axios from "axios";
import "../config/config.js";

const axiosInstance = axios.create({
  baseURL: `${process.env.STRAPI_URL}/graphql`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
  },
});

async function fetchAllPaginated(queryName, query) {
  let allData = [];
  let start = 0;
  const limit = 10; // DO NOT CHANGE THE LIMIT

  while (true) {
    const response = await axiosInstance.post("", {
      query,
      variables: { start, limit },
    });

    const data = response.data.data[queryName].data;
    if (data.length === 0) break; // No more items to fetch

    allData = [...allData, ...data];

    // console.log(`Fetched ${data.length} items. Total: ${allData.length}`);

    start += limit;
  }

  console.log(`Total ${queryName} fetched: ${allData.length}`);
  return allData;
}

async function fetchProductFilters() {
  const query = `
    query GetProductFilters($start: Int!, $limit: Int!) {
      productFilters(pagination: { start: $start, limit: $limit }) {
        data {
          id
          attributes {
            title
            alternative_titles {
              title
            }
          }
        }
      }
    }
  `;

  return fetchAllPaginated("productFilters", query);
}

async function fetchAllProductTypes() {
  const query = `
    query GetAllProductTypes($start: Int!, $limit: Int!) {
      productTypes(pagination: { start: $start, limit: $limit }) {
        data {
          id
          attributes {
            title
          }
        }
      }
    }
  `;

  return fetchAllPaginated("productTypes", query);
}

async function fetchProductsForType(productTypeId) {
  const query = `
    query GetProductsForType($id: ID!, $start: Int!, $limit: Int!) {
      productType(id: $id) {
        data {
          attributes {
            products(pagination: { start: $start, limit: $limit }) {
              data {
                id
                attributes {
                  params {
                    id
                    key
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  let allProducts = [];
  let start = 0;
  const limit = 10; // DO NOT CHANGE THE LIMIT

  while (true) {
    const response = await axiosInstance.post("", {
      query,
      variables: { id: productTypeId, start, limit },
    });

    const productType = response.data.data.productType.data;
    const products = productType.attributes.products.data;
    if (products.length === 0) break; // No more products to fetch

    // Fetch all params for each product
    const productsWithAllParams = await Promise.all(
      products.map(async (product) => {
        const allParams = await fetchAllParamsForProduct(product.id);
        return {
          ...product,
          attributes: {
            ...product.attributes,
            params: allParams,
          },
        };
      })
    );

    allProducts = [...allProducts, ...productsWithAllParams];

    // console.log(`Fetched ${products.length} products. Total: ${allProducts.length}`);

    start += limit;
  }

  console.log(
    `Total products fetched for type ${productTypeId}: ${allProducts.length}`
  );
  return allProducts;
}

async function fetchAllParamsForProduct(productId) {
  const query = `
    query GetAllParamsForProduct($id: ID!, $start: Int!, $limit: Int!) {
      product(id: $id) {
        data {
          attributes {
            params(pagination: { start: $start, limit: $limit }) {
              id
              key
              value
            }
          }
        }
      }
    }
  `;

  let allParams = [];
  let start = 0;
  const limit = 100; // We can use a higher limit for params

  while (true) {
    const response = await axiosInstance.post("", {
      query,
      variables: { id: productId, start, limit },
    });

    const params = response.data.data.product.data.attributes.params;
    if (params.length === 0) break; // No more params to fetch

    allParams = [...allParams, ...params];

    start += limit;
  }

  return allParams;
}

async function updateProductFilter(filterId, updatedFilters) {
  const mutation = `
    mutation UpdateProductFilter($id: ID!, $filters: JSON) {
      updateProductFilter(id: $id, data: { filters: $filters }) {
        data {
          id
          attributes {
            title
            filters
          }
        }
      }
    }
  `;

  try {
    const response = await axiosInstance.post("", {
      query: mutation,
      variables: { id: filterId, filters: updatedFilters },
    });
    return response.data.data.updateProductFilter.data;
  } catch (error) {
    console.error(`Error updating ProductFilter ${filterId}:`, error.message);
    throw error;
  }
}

async function rebuildAllProductFilters() {
  try {
    const productFilters = await fetchProductFilters();
    const productTypes = await fetchAllProductTypes();

    console.log("ProductFilters to update:");
    console.log(JSON.stringify(productFilters, null, 2));

    console.log("\nAll ProductTypes:");
    console.log(JSON.stringify(productTypes, null, 2));

    for (const filter of productFilters) {
      const filterTitles = [
        filter.attributes.title,
        ...filter.attributes.alternative_titles.map((alt) => alt.title),
      ];

      console.log(`\nProcessing ProductFilter ${filter.id}:`);
      console.log("Filter Titles:", filterTitles);

      const updatedFilters = [];

      for (const productType of productTypes) {
        const productTypeId = productType.id;
        const products = await fetchProductsForType(productTypeId);

        console.log(`Processing Product Type ${productTypeId}:`);
        console.log("Number of products:", products.length);

        const values = new Set();
        products.forEach((product) => {
          product.attributes.params.forEach((param) => {
            if (filterTitles.includes(param.key)) {
              values.add(param.value);
            }
          });
        });

        if (values.size > 0) {
          const filterItem = {
            productType: productTypeId,
            values: Array.from(values),
          };
          updatedFilters.push(filterItem);

          console.log("Created Filter Item:");
          console.log(JSON.stringify(filterItem, null, 2));
        } else {
          console.log(
            `No matching values found for Product Type ${productTypeId}`
          );
        }
      }

      console.log("\nUpdated Filters for ProductFilter", filter.id);
      console.log(JSON.stringify(updatedFilters, null, 2));

      await updateProductFilter(filter.id, updatedFilters);
      console.log(`Updated ProductFilter ${filter.id} in the database`);
    }

    console.log("\nAll ProductFilters rebuilt successfully");
  } catch (error) {
    console.error("Error rebuilding ProductFilters:", error);
  }
}

// Run the rebuild process
rebuildAllProductFilters();
