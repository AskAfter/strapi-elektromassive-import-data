import { DEFAULT_LOCALE, locales } from "../index.js";
import axiosInstance from "../api/axiosInstance.js";
import { getParameterValueLocalization } from "./parameterValues.js";
import { getProductLocalization } from "./products.js";

import "../../config/config.js";

async function createProductParameter(
  productId,
  parameterValueId,
  locale = DEFAULT_LOCALE
) {
  const mutation = `
    mutation CreateProductParameter($data: ProductParameterInput!, $locale: I18NLocaleCode!) {
      createProductParameter(data: $data, locale: $locale) {
        data {
          id
        }
      }
    }
  `;

  const variables = {
    data: {
      product: productId,
      parameter_value: parameterValueId,
      publishedAt: new Date().toISOString(),
    },
    locale,
  };

  try {
    const { data } = await axiosInstance.post("", {
      query: mutation,
      variables,
    });

    if (
      data?.errors?.[0]?.extensions?.exception?.details?.isExists ||
      data?.errors?.[0]?.message.includes("locale is already used") ||
      data?.errors?.[0]?.message.includes("already exists")
    ) {
      return {
        id:
          data.errors[0].extensions.exception.details.existingId ||
          "not known but exist",
        isExisting: true,
      };
    }

    return data.data.createProductParameter.data;
  } catch (error) {
    console.error("Error creating product parameter:".red, error);
    throw error;
  }
}

async function getProductParameters(productId, locale = DEFAULT_LOCALE) {
  const query = `
    query GetProductParameters($productId: ID!, $locale: I18NLocaleCode!) {
      productParameters(
        filters: { product: { id: { eq: $productId } } }
        locale: $locale
      ) {
        data {
          id
          attributes {
            parameter_value {
              data {
                id
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    productId,
    locale,
  };

  try {
    const { data } = await axiosInstance.post("", { query, variables });
    return data.data.productParameters.data;
  } catch (error) {
    console.error(`Error getting product parameters:`, error);
    return [];
  }
}

async function createProductParameterLocalization(
  productParameterId,
  localizedProductId,
  localizedParameterValueId,
  locale
) {
  const mutation = `
    mutation CreateProductParameterLocalization($id: ID!, $locale: I18NLocaleCode!, $data: ProductParameterInput!) {
      createProductParameterLocalization(id: $id, locale: $locale, data: $data) {
        data {
          id
          attributes {
            locale
          }
        }
      }
    }
  `;

  const variables = {
    id: productParameterId,
    locale,
    data: {
      product: localizedProductId,
      parameter_value: localizedParameterValueId,
      publishedAt: new Date().toISOString(),
    },
  };

  try {
    const { data } = await axiosInstance.post("", {
      query: mutation,
      variables,
    });

    if (
      data?.errors?.[0]?.extensions?.exception?.details?.isExists ||
      data?.errors?.[0]?.message.includes("locale is already used") // it's strapi build in error
    ) {
      return {
        id:
          data.errors[0].extensions.exception.details.existingId ||
          "not known but exist",
        isExisting: true,
      };
    }

    return data.data.createProductParameterLocalization.data;
  } catch (error) {
    console.error(`Error creating product parameter localization:`.red, error);
    throw error;
  }
}

async function linkProductToParameterValues(productId, parameterValueIds) {
  for (const parameterValueId of parameterValueIds) {
    try {
      await createProductParameter(productId, parameterValueId, DEFAULT_LOCALE);

      console.log(
        `Parameter value ${parameterValueId} linked to product ${productId}`
          .green
      );
    } catch (error) {
      if (error?.message?.includes("already exists")) {
        console.log(
          `Parameter value ${parameterValueId} already linked to product ${productId}`
            .yellow
        );
      } else {
        console.error(
          `Error linking parameter value ${parameterValueId} to product ${productId}:`
            .red,
          error
        );
        throw error;
      }
    }
  }
}

export {
  createProductParameter,
  getProductParameters,
  createProductParameterLocalization,
  linkProductToParameterValues,
};
