import { fileURLToPath } from "url";
import { dirname } from "path";
import "colors";
import { logToFile } from "../utils/logToFile.js";
import { productsToUpdate } from "./productsToUpdate.js";
import "../config/config.js";

// Initialize environment variables

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Fetch product by part number
 * @param {string} partNumber - Product part number
 * @returns {Promise<Object|null>} - Product data or null if not found
 */
const getProductByPartNumber = async (partNumber) => {
  try {
    const response = await fetch(
      `${process.env.STRAPI_URL}/api/products?filters[part_number][$eq]=${partNumber}&populate=localizations`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
        },
      }
    );

    const result = await response.json();

    if (!response.ok) {
      const errorMessage = `Ошибка при загрузке продукта: ${JSON.stringify(
        result
      )}`;
      console.log(errorMessage.red);
      logToFile(errorMessage, __dirname);
      process.exit(1);
    }

    if (result.data.length === 0) {
      const errorMessage = `Товар с артикулом ${partNumber} не найден`;
      console.log(errorMessage.yellow);
      logToFile(errorMessage, __dirname);
      process.exit(1);
    }

    return result.data[0];
  } catch (error) {
    const errorMessage = `Ошибка при загрузке продукта: ${error.message}`;
    console.log(errorMessage.red);
    logToFile(errorMessage, __dirname);
    process.exit(1);
  }
};

/**
 * Update product price
 * @param {number} productId - Product ID
 * @param {number} newPrice - New price value
 * @returns {Promise<boolean>} - Success status
 */
const updateProductPrice = async (productId, newPrice) => {
  try {
    const response = await fetch(
      `${process.env.STRAPI_URL}/api/products/${productId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
        },
        body: JSON.stringify({
          data: {
            retail: newPrice,
          },
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      const errorMessage = `Ошибка при обновлении цены продукта: ${JSON.stringify(
        result
      )}`;
      console.log(errorMessage.red);
      logToFile(errorMessage, __dirname);
      process.exit(1);
    }

    console.log(
      `Цена обновлена ​​для ID товара ${productId} на ${newPrice}`.green
    );
    return true;
  } catch (error) {
    const errorMessage = `Ошибка при обновлении цены продукта: ${error.message}`;
    console.log(errorMessage.red);
    logToFile(errorMessage, __dirname);
    process.exit(1);
  }
};

/**
 * Main function to update prices for products and their localizations
 */
const updatePrices = async () => {
  console.log(
    `Начало обновления цен для ${productsToUpdate.length} товаров`.blue
  );

  for (const item of productsToUpdate) {
    const { part_number, updatedPrice } = item;

    console.log(`Обработка продукта с артикулом: ${part_number}`.cyan);

    // Get product data
    const product = await getProductByPartNumber(part_number);

    // Update main product price
    const mainProductId = product.id;
    await updateProductPrice(mainProductId, updatedPrice);

    // Update localizations if they exist
    if (
      product.attributes.localizations &&
      product.attributes.localizations.data.length > 0
    ) {
      console.log(
        `Обновление ${product.attributes.localizations.data.length} локализаций версий для ${part_number}`
          .cyan
      );

      for (const localization of product.attributes.localizations.data) {
        const localizationId = localization.id;
        await updateProductPrice(localizationId, updatedPrice);
      }
    } else {
      console.log(`Для товара не найдено локализаций ${part_number}`.yellow);
    }

    console.log(`Завершена обработка товара ${part_number}`.green);
    console.log("---------------------------------------------------");
  }

  console.log("Процесс обновления цен завершен успешно".blue.bold);
};

// Execute the update process
updatePrices().catch((error) => {
  const errorMessage = `Необработанная ошибка в процессе обновления цен: ${
    error.stack || error.message
  }`;
  console.error(errorMessage.red.bold);
  logToFile(errorMessage, __dirname);
  process.exit(1);
});
