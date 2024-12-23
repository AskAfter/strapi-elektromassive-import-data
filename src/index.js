import { fileURLToPath } from "url";
import { dirname } from "path";

import { uploadMedia } from "../shared/uploadMedia/uploadMediaToS3.js";
import "../config/config.js";
import {
  videxLampsS3Endpoints,
  titanumS3Endpoints,
  videxTableLampsS3Endpoints,
} from "../config/constants.js";
import slugify from "slugify";

import "colors";

import { logToFile } from "../utils/logToFile.js";
import { products } from "./products.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Post product data to Strapi API
const addProduct = async (product) => {
  // Upload additional images
  let additionalImagesData;
  if (product.additional_images) {
    additionalImagesData = await uploadMedia(
      product.additional_images,
      product.title,
      videxLampsS3Endpoints.ledFolderS3Path //TODO: CHANGE THE PATH TO UPLOAD INTO THE RIGHT FOLDER
    );
  }

  if (additionalImagesData.error) {
    const message = `Skipping product due to ZIP file error: ${product.title}`
      .red;
    logToFile(message, __dirname);
    return null;
  }

  const paramsObject = product.params.reduce((acc, { key, value }) => {
    acc[key] = value;
    return acc;
  }, {});

  const slug = slugify(product.title, {
    lower: true,
    strict: true,
  });

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
        params: paramsObject,
        image_link: product.image_link,
        description: product.description,
        additional_images: additionalImagesData
          ? additionalImagesData.mediaRecords.map(({ link }) => ({
              link,
            }))
          : null,
        slug: slug,
        subcategory: 1, //TODO: change the subcategory id
      },
    }),
  });

  const result = await response.json();

  if (response.ok) {
    console.log(
      `The product ${result.data.id} successfully uploded to Stapi.`.blue
    );
  } else {
    console.log(
      `${JSON.stringify(result)}`.yellow,
      `${product.part_number}`.red
    );
  }
};

products.forEach((product, index) => addProduct(product));
