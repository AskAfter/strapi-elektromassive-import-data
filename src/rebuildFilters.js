import axios from "axios";
import "../config/config.js";

const axiosInstance = axios.create({
  baseURL: `${process.env.STRAPI_URL}/graphql`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
  },
});

async function fetchProductFilters() {
  const query = `
    query GetProductFilters {
      productFilters(pagination: {  limit: -1 }) {
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

  try {
    const response = await axiosInstance.post("", {
      query,
    });

    const data = response.data.data.productFilters.data;

    return data;
  } catch (error) {
    console.error("Error fetching product filters:", error);
    throw error;
  }
}

async function fetchAllProductTypes() {
  const query = `
    query GetAllProductTypes {
      productTypes(pagination: {  limit: -1 }) {
        data {
          id
          attributes {
            title
          }
        }
      }
    }
  `;

  try {
    const response = await axiosInstance.post("", {
      query,
    });

    const data = response.data.data.productTypes.data;

    return data;
  } catch (error) {
    console.error("Error fetching product types:", error);
    throw error;
  }
}

async function fetchProductsForType(productTypeId) {
  const query = `
    query GetProductsForType($id: ID!) {
      productType(id: $id) {
        data {
          attributes {
            products(pagination: {  limit: -1 }) {
              data {
                id
                attributes {
                  params(pagination: {  limit: -1 }) {
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
  try {
    const response = await axiosInstance.post("", {
      query,
      variables: { id: productTypeId },
    });

    const products =
      response.data.data.productType.data.attributes.products.data;

    console.log(
      `Total products fetched for type ${productTypeId}: ${products.length}`
    );

    return products;
  } catch (error) {
    console.error(
      `Error fetching products for type ${productTypeId}:`,
      error.message
    );
    throw error;
  }
}

async function updateProductFilter(filterId, updatedFilterValues) {
  const mutation = `
    mutation UpdateProductFilter(
      $id: ID!
      $filterValues: [ComponentFilterValuesTypevaluesInput]
    ) {
      updateProductFilter(id: $id, data: { FilterValues: $filterValues }) {
        data {
          id
          attributes {
            title
            FilterValues {
              product_type {
                data {
                  id
                }
              }
              values
            }
          }
        }
      }
    }
  `;

  const formattedFilterValues = updatedFilterValues.map((item) => ({
    product_type: item.productType,
    values: item.values,
  }));

  try {
    const response = await axiosInstance.post("", {
      query: mutation,
      variables: { id: filterId, filterValues: formattedFilterValues },
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

      const updatedFilterValues = [];

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
          const filterValue = {
            productType: productTypeId,
            values: JSON.stringify(Array.from(values)),
          };
          updatedFilterValues.push(filterValue);

          console.log("Created Filter Item:");
          console.log(JSON.stringify(filterValue, null, 2));
        } else {
          console.log(
            `No matching values found for Product Type ${productTypeId}`
          );
        }
      }

      console.log("\nUpdated Filters for ProductFilter", filter.id);
      console.log(JSON.stringify(updatedFilterValues, null, 2));

      await updateProductFilter(filter.id, updatedFilterValues);
      console.log(`Updated ProductFilter ${filter.id} in the database`);
    }

    console.log("\nAll ProductFilters rebuilt successfully");
  } catch (error) {
    console.error("Error rebuilding ProductFilters:", error);
  }
}

// Run the rebuild process
rebuildAllProductFilters();
