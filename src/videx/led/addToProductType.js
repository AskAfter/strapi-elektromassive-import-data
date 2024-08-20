import { getProductTypeResponse } from "../../graphql/product-type.js";

import "colors";

const addProdcutsToType = async () => {
  // Generate an array of IDs from 172 to 244
  const startId = 172; //TODO: change the product ids after creating it
  const endId = 244; //TODO: change the product ids after creating it
  const productIds = Array.from(
    { length: endId - startId + 1 },
    (_, i) => startId + i
  );

  const productTypeData = await getProductTypeResponse("LED"); //TODO: change title of product type

  const updateProductTypeResponse = await fetch(
    `${process.env.STRAPI_URL}/api/product-types/${1}`, //TODO: change the id of product type
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
      },
      body: JSON.stringify({
        data: {
          products: [
            ...productTypeData.data.productTypes.data[0].attributes.products.data.concat(
              productIds
            ),
          ],
        },
      }),
    }
  );

  const updatedProductTypeData = await updateProductTypeResponse.json();

  if (updatedProductTypeData.data) {
    console.log(
      `The product type with '${updatedProductTypeData.data.attributes.title}' title successfully udpated.`
        .blue
    );
  } else {
    console.log(`${updatedProductTypeData.error.message}`.yellow);
  }
};

addProdcutsToType();
