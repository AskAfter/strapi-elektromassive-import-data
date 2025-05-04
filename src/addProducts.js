import { fileURLToPath } from "url";
import { dirname } from "path";

import { linkProductToParameterValues } from "./services/productParameters.js";
import {
  createProduct,
  getProduct,
  updateProduct,
} from "./services/products.js";

import {
  videxLampsS3Endpoints,
  titanumS3Endpoints,
  videxTableLampsS3Endpoints,
} from "../config/constants.js";
import transliterate from "transliterate";
import slugify from "slugify";
import { logToFile } from "../utils/logToFile.js";
import { uploadMedia } from "../shared/uploadMedia/uploadMediaToS3.js";
import { products } from "../data/products.js";
import { findOrCreateParameterType } from "./services/parameterTypes.js";
import { findOrCreateParameterValue } from "./services/parameterValues.js";

import "colors";

import "../config/config.js";
import { parameterTypeCache, parameterValueCache } from "../utils/cache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Post product data to Strapi API
const addProduct = async (product) => {
  const langArg = process.argv.find((arg) => arg.startsWith("lang="));
  const lang = langArg ? langArg.split("=")[1] : "uk";

  // Upload additional images
  let additionalImagesData;
  if (product.additional_images) {
    additionalImagesData = await uploadMedia(
      product.additional_images,
      product.title,
      videxLampsS3Endpoints.ledFolderS3Path //TODO: CHANGE THE PATH TO UPLOAD INTO THE RIGHT FOLDER
    );
  }

  if (additionalImagesData?.error) {
    const message = `Skipping product due to ZIP file error: ${product.title}`
      .red;
    logToFile(message, __dirname);
    return null;
  }

  const existingProduct = await getProduct(product.part_number, lang);
  const parameterValueIds = [];

  for (const { key, value } of product.params) {
    const parameterTypeId = await findOrCreateParameterType(key, lang);

    const parameterValueId = await findOrCreateParameterValue(
      parameterTypeId,
      value,
      lang
    );
    parameterValueIds.push(parameterValueId);
  }

  const slug = slugify(transliterate(product.title), {
    lower: true,
    strict: true,
  });

  const { title, part_number, retail, currency, image_link, description } =
    product;

  const productInfo = {
    title,
    part_number,
    retail,
    currency,
    image_link,
    description,
  };

  if (existingProduct?.id) {
    const updatedProduct = await updateProduct(
      existingProduct.id,
      {
        ...productInfo,
        slug,
        additional_images: additionalImagesData
          ? additionalImagesData.mediaRecords.map(({ link }) => ({
              link,
            }))
          : [],
        subcategory: 15, //TODO: change the subcategory id
        publishedAt: new Date().toISOString(),
      },
      lang
    );

    await linkProductToParameterValues(updatedProduct.id, parameterValueIds);

    console.log(`Product ${updatedProduct.id} updated successfully`.green);
  } else {
    const createdProduct = await createProduct(
      {
        ...productInfo,
        slug,
        additional_images: additionalImagesData
          ? additionalImagesData.mediaRecords.map(({ link }) => ({
              link,
            }))
          : [],
        subcategory: 15, //TODO: change the subcategory id
        publishedAt: new Date().toISOString(),
      },
      lang
    );

    await linkProductToParameterValues(createdProduct.id, parameterValueIds);
    console.log(`Product ${createdProduct.id} created successfully`.green);
  }
};

async function processProducts() {
  let processed = 0;
  const total = products.length;

  for (const product of products) {
    await addProduct(product);
    processed++;

    if (processed % 10 === 0 || processed === total) {
      console.log(
        `Processed ${processed}/${total} products (${Math.round(
          (processed / total) * 100
        )}%)`.blue
      );
      console.log(
        `Cache stats: ${parameterTypeCache.size} parameter types, ${parameterValueCache.size} parameter values`
          .gray
      );
    }
  }
}

processProducts().catch((error) =>
  console.error("Error processing products:", error)
);
