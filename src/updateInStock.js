import { fileURLToPath } from "url";
import { dirname } from "path";
import "colors";
import { logToFile } from "../utils/logToFile.js";
import { productsToInStockUpdate } from "../data/productsToInStockUpdate.js";
import "../config/config.js";

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
 * Update product in_stock value
 * @param {number} productId - Product ID
 * @param {number} inStockValue - New in_stock value
 * @returns {Promise<boolean>} - Success status
 */
const updateProductInStock = async (productId, inStockValue) => {
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
            in_stock: inStockValue,
          },
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      const errorMessage = `Ошибка при обновлении количества товара: ${JSON.stringify(
        result
      )}`;
      console.log(errorMessage.red);
      logToFile(errorMessage, __dirname);
      process.exit(1);
    }

    console.log(
      `Количество обновлено для ID товара ${productId} на ${inStockValue}`.green
    );
    return true;
  } catch (error) {
    const errorMessage = `Ошибка при обновлении количества товара: ${error.message}`;
    console.log(errorMessage.red);
    logToFile(errorMessage, __dirname);
    process.exit(1);
  }
};

/**
 * Main function to update in_stock values for products and their localizations
 */
const updateInStock = async () => {
  console.log(
    `Начало обновления количества товаров для ${productsToInStockUpdate.length} товаров`
      .blue
  );

  for (const item of productsToInStockUpdate) {
    const { part_number, updatedInStock = 10 } = item; // Значение по умолчанию 10, если не указано

    console.log(`Обработка продукта с артикулом: ${part_number}`.cyan);

    // Get product data
    const product = await getProductByPartNumber(part_number);

    // Update main product in_stock
    const mainProductId = product.id;
    await updateProductInStock(mainProductId, updatedInStock);

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
        await updateProductInStock(localizationId, updatedInStock);
      }
    } else {
      console.log(`Для товара не найдено локализаций ${part_number}`.yellow);
    }

    console.log(`Завершена обработка товара ${part_number}`.green);
    console.log("---------------------------------------------------");
  }

  console.log(
    "Процесс обновления количества товаров завершен успешно".blue.bold
  );
};

// Execute the update process
updateInStock().catch((error) => {
  const errorMessage = `Необработанная ошибка в процессе обновления количества товаров: ${
    error.stack || error.message
  }`;
  console.error(errorMessage.red.bold);
  logToFile(errorMessage, __dirname);
  process.exit(1);
});
