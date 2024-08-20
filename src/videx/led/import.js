import { fileURLToPath } from "url";
import { dirname } from "path";

import { uploadMedia } from "../../../shared/uploadMedia/uploadMediaToS3.js";
import "../../../config/config.js";
import { products } from "../../../shared/led/videx/products.js";
import "colors";
import { ledFolderS3Path } from "../../../config/constants.js";
import { logToFile } from "../../../utils/logToFile.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Post product data to Strapi API
const addProduct = async (product) => {
  // Upload additional images
  const additionalImagesData = await uploadMedia(
    product.additional_images,
    product.title,
    ledFolderS3Path
  );

  if (additionalImagesData.error) {
    const message = `Skipping product due to ZIP file error: ${product.title}`
      .red;
    logToFile(message, __dirname);
    return null;
  }

  const response = await fetch(`${process.env.STRAPI_URL}/api/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
    },
    body: JSON.stringify({
      data: {
        part_number: product.part_number,
        title: product.title,
        currency: product.currency,
        retail: product.retail,
        params: product.params.map((param) => ({
          key: param.key,
          value: param.value,
        })),
        image_link: product.image_link,
        additional_images: additionalImagesData.mediaRecords.map(
          ({ link }) => ({
            link,
          })
        ),
        subcategory: 2, //TODO: change the subcategory id
      },
    }),
  });

  const result = await response.json();

  if (response.ok) {
    console.log(
      `The product ${result.data.id} successfully uploded to Stapi.`.blue
    );
  } else {
    console.log(`${JSON.stringify(result)}`.yellow);
  }
};

products.forEach((product, index) => addProduct(product));

// for (let i = 0; i < 5; i++) {
//   addProduct(products[i]);
// }
