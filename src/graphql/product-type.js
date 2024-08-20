// Fetch Product Type ID by Title
export const getProductTypeIdByTitle = async (title) => {
  const query = `
    query {
        productTypes(filters: { title: { eq: ${title} } }) {
            data {
            id
            attributes {
                title
            }
            }
        }
    }
  `;

  const response = await fetch(`${process.env.STRAPI_URL}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
    },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();
  return result.data.productTypes.data[0]?.id || null;
};

export const getProductTypeResponse = async (title) => {
  const query = `
    query {
      productTypes(filters: { title: { eq: "${title}" } }) {
        data {
          id
          attributes {
            title
            products{
              data{
                id
              }
            }
          }
        }
      }
    }
  `;

  const productTypeResponse = await fetch(`${process.env.STRAPI_URL}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
    },
    body: JSON.stringify({ query }),
  });

  const productTypeData = await productTypeResponse.json();

  return productTypeData;
};
