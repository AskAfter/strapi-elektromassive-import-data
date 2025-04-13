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
import translatte from "translatte";

import "colors";

import { logToFile } from "../utils/logToFile.js";
import { products } from "./products.js";

import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const locales = ["uk", "ru"];
const DEFAULT_LOCALE = "uk";

const axiosInstance = axios.create({
  baseURL: `${process.env.STRAPI_URL}/graphql`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
  },
});

async function getParameterType(name, locale = DEFAULT_LOCALE) {
  const query = `
  query GetParameterType($name: String!, $locale: I18NLocaleCode!) {
    parameterTypes(filters: { name: { eq: $name } }, locale: $locale) {
      data {
        id
        attributes {
          name
          slug
          localizations{
            data{
              id
              attributes{
                locale
              }
            }
          }
        }
      }
    }
  }
  `;

  const variables = {
    name,
    locale,
  };

  try {
    const { data } = await axiosInstance.post("", { query, variables });
    return data.data.parameterTypes.data[0];
  } catch (error) {
    console.log(`Error getting parameter type ${name}:`.red, error);
    throw error;
  }
}

async function addParameterType(name, locale = DEFAULT_LOCALE) {
  const slug = slugify(name, { lower: true, strict: true });

  const mutation = `
    mutation CreateParameterType($data: ParameterTypeInput!, $locale: I18NLocaleCode!) {
      createParameterType(data: $data, locale: $locale) {
        data {
          id
          attributes {
            name
            slug
          }
        }
      }
    }
  `;

  const variables = {
    data: {
      name,
      slug,
      publishedAt: new Date().toISOString(),
    },
    locale,
  };

  try {
    const { data } = await axiosInstance.post("", {
      query: mutation,
      variables,
    });

    return data.data.createParameterType.data;
  } catch (error) {
    console.log(`Error creating parameter type ${name}:`.red, error);
    throw error;
  }
}

async function getParameterTypeById(id, locale) {
  const query = `
  query GetParameterTypeID($id: ID!, $locale: I18NLocaleCode!) {
    parameterType(id: $id, locale: $locale) {
      data {
        id
        attributes {
          name
          slug
          localizations{
            data{
              id
              attributes{
                locale
              }
            }
          }
        }
      }
    }
  }
  `;

  const variables = {
    id,
    locale,
  };

  try {
    const { data } = await axiosInstance.post("", { query, variables });
    return data.data.parameterType.data;
  } catch (error) {
    console.log(`Error getting parameter type by id:`.red, error);
    throw error;
  }
}

async function createParameterTypeLocalization(
  parameterTypeId,
  finalLocale,
  slug,
  name
) {
  const mutation = `
    mutation CreateParameterTypeLocalization($id: ID!, $locale: I18NLocaleCode!, $data: ParameterTypeInput!) {
      createParameterTypeLocalization(id: $id, locale: $locale, data: $data) {
        data {
          id
          attributes {
            locale
          }
        }
      }
    }
  `;

  const translatedName = await translatte(name, {
    to: finalLocale,
  });

  const variables = {
    id: parameterTypeId,
    locale: finalLocale,
    data: {
      name: translatedName.text,
      slug,
      publishedAt: new Date().toISOString(),
    },
  };

  try {
    const { data } = await axiosInstance.post("", {
      query: mutation,
      variables,
    });

    return data.data.createParameterTypeLocalization.data;
  } catch (error) {
    console.log(
      `Error creating parameter type localization ${name}:`.red,
      error
    );
    throw error;
  }
}

const findOrCreateParameterType = async (name, locale) => {
  const parameterType = await getParameterType(name, locale);
  const finalLocale = locales.find((l) => l !== locale);

  if (parameterType?.id) {
    if (
      !parameterType.attributes.localizations?.data?.find(
        (l) => l.attributes.locale === finalLocale
      )
    ) {
      await createParameterTypeLocalization(
        parameterType.id,
        finalLocale,
        parameterType.attributes.slug,
        parameterType.attributes.name
      );
    }
    return parameterType?.id;
  }

  const createdParameterType = await addParameterType(name, locale);

  const parameterTypeId = createdParameterType.id;

  const slug = createdParameterType.attributes.slug;
  const createdName = createdParameterType.attributes.name;

  await createParameterTypeLocalization(
    parameterTypeId,
    finalLocale,
    slug,
    createdName
  );

  return parameterTypeId;
};

async function getParameterValue(
  value,
  parameterTypeId,
  locale = DEFAULT_LOCALE
) {
  const query = `
  query GetParameterValue($value: String!,  $parameterTypeId: ID!, $locale: I18NLocaleCode!) {
    parameterValues(filters: { value: { eq: $value }, parameter_type: { id: { eq: $parameterTypeId } } }, locale: $locale) {
      data {
        id
        attributes {
          value
          code
        }
      }
    }
  }
  `;

  const variables = {
    value,
    parameterTypeId,
    locale,
  };

  try {
    const { data } = await axiosInstance.post("", { query, variables });
    return data.data.parameterValues.data[0];
  } catch (error) {
    console.log(`Error getting parameter value ${value}:`.red, error);
    throw error;
  }
}

async function addParameterValue(
  value,
  parameterTypeId,
  locale = DEFAULT_LOCALE
) {
  const query = `
  mutation CreateParameterValue($data: ParameterValueInput!, $locale: I18NLocaleCode!) {
    createParameterValue(data: $data, locale: $locale) {
      data {
        id
        attributes {
          value
          code
        }
      }
    }
  }
  `;

  const code = slugify(value, { lower: true, strict: true }).concat(
    `-${parameterTypeId}`
  );

  const variables = {
    data: {
      code,
      value,
      parameter_type: parameterTypeId,
      publishedAt: new Date().toISOString(),
    },
    locale,
  };

  try {
    const { data } = await axiosInstance.post("", { query, variables });
    return data.data.createParameterValue.data;
  } catch (error) {
    console.log(`Error creating parameter value ${value}:`.red, error);
    throw error;
  }
}

async function createParameterValueLocalization(
  parameterValueId,
  locale,
  code,
  value,
  parameterTypeLocalizationId
) {
  const mutation = `
    mutation CreateParameterValueLocalization($id: ID!, $locale: I18NLocaleCode!, $data: ParameterValueInput!) {
      createParameterValueLocalization(id: $id, locale: $locale, data: $data) {
        data {
          id
          attributes {
            locale
          }
        }
      }
    }
  `;

  const translatedValue = await translatte(value, {
    to: locale,
  });

  const variables = {
    id: parameterValueId,
    locale,
    data: {
      code,
      value: translatedValue.text,
      parameter_type: parameterTypeLocalizationId,
      publishedAt: new Date().toISOString(),
    },
  };

  try {
    const { data } = await axiosInstance.post("", {
      query: mutation,
      variables,
    });

    return data.data.createParameterValueLocalization.data;
  } catch (error) {
    console.log(
      `Error creating parameter value localization ${value}:`.red,
      error
    );
    throw error;
  }
}

const findOrCreateParameterValue = async (parameterTypeId, value, locale) => {
  const parameterValue = await getParameterValue(
    value,
    parameterTypeId,
    locale
  );

  if (parameterValue?.id) {
    return parameterValue?.id;
  }

  const createdParameterValue = await addParameterValue(
    value,
    parameterTypeId,
    locale
  );

  const parameterValueId = createdParameterValue.id;

  const code = createdParameterValue.attributes.code;
  const createdValue = createdParameterValue.attributes.value;
  const finalLocale = locales.find((l) => l !== locale);
  const parameterType = await getParameterTypeById(parameterTypeId, locale);

  const localizedParameterTypeId =
    parameterType.attributes.localizations.data.find(
      (l) => l.attributes.locale === finalLocale
    );

  await createParameterValueLocalization(
    parameterValueId,
    finalLocale,
    code,
    createdValue,
    localizedParameterTypeId.id
  );

  return parameterValueId;
};

async function getProduct(partNumber, locale) {
  const query = `
    query GetProductByPartNumber($partNumber: String!, $locale: I18NLocaleCode!) {
      products(filters: { part_number: { eq: $partNumber } }, locale: $locale) {
        data {
          id
          attributes {
            id
          }
        }
      }
    }
  `;

  try {
    const response = await axiosInstance.post("", {
      query,
      variables: { partNumber, locale },
    });
    return response.data.data.products.data[0];
  } catch (error) {
    console.error("Error fetching product:", error);
    throw error;
  }
}

const updateProduct = async (id, product, locale) => {
  const query = `
    mutation UpdateProduct($id: ID!, $data: ProductInput!, $locale: I18NLocaleCode!) {
      updateProduct(id: $id, data: $data, locale: $locale) {
        data {
          id
        }
      }
    }
  `;

  try {
    const response = await axiosInstance.post("", {
      query,
      variables: { id, data: product, locale },
    });
    return response.data.data.updateProduct.data;
  } catch (error) {
    console.error("Error updating product:", error);
    throw error;
  }
};

async function createProduct(product, locale) {
  const query = `
    mutation CreateProduct($data: ProductInput!, $locale: I18NLocaleCode!) {
      createProduct(data: $data, locale: $locale) {
        data {
          id
        }
      }
    }
  `;

  try {
    const response = await axiosInstance.post("", {
      query,
      variables: { data: product, locale },
    });
    return response.data.data.createProduct.data;
  } catch (error) {
    console.error("Error creating product:", error);
    throw error;
  }
}

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

  const slug = slugify(product.title, {
    lower: true,
    strict: true,
  });

  const existingProduct = await getProduct(product.part_number, lang);

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
        parameter_values: [...parameterValueIds],
        additional_images: additionalImagesData
          ? additionalImagesData.mediaRecords.map(({ link }) => ({
              link,
            }))
          : [],
        subcategory: 1, //TODO: change the subcategory id
      },
      lang
    );

    console.log(`Product ${updatedProduct.id} updated successfully`.green);
  } else {
    const createdProduct = await createProduct(
      {
        ...productInfo,
        slug,
        parameter_values: [...parameterValueIds],
        additional_images: additionalImagesData
          ? additionalImagesData.mediaRecords.map(({ link }) => ({
              link,
            }))
          : [],
        subcategory: 1, //TODO: change the subcategory id
      },
      lang
    );
    console.log(`Product ${createdProduct.id} created successfully`.green);
  }
};

async function processProducts() {
  for (const product of products) {
    await addProduct(product);
  }
}

processProducts().catch((error) =>
  console.error("Error processing products:", error)
);
