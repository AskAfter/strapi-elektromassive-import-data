import slugify from "slugify";
import axiosInstance from "../api/axiosInstance.js";
import transliterate from "transliterate";
import { cleanString, translateText } from "../../utils/translation.js";
import { parameterValueCache } from "../../utils/cache.js";
import { getParameterTypeById } from "./parameterTypes.js";
import { DEFAULT_LOCALE, locales } from "../index.js";

import "../../config/config.js";

const parameterValueLocalizationsCache = new Map();

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

  const code = slugify(transliterate(value), {
    lower: true,
    strict: true,
  }).concat(`-${parameterTypeId}`);

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

  let translatedValue;

  if (
    typeof value === "string" &&
    (/^[\d\.,\-\+\s]+$/.test(value) ||
      /^\d+([.,]\d+)?\s*(мм|м|см|кг|г|°C|%|л)$/i.test(value) ||
      /[a-zA-Z]/.test(value))
  ) {
    translatedValue = value;
  } else {
    translatedValue = await translateText(value, "ru");
    translatedValue = cleanString(translatedValue);
  }

  const variables = {
    id: parameterValueId,
    locale,
    data: {
      code,
      value: translatedValue,
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
  const cacheKey = `${parameterTypeId}_${value}_${locale}`;

  if (parameterValueCache.has(cacheKey)) {
    return parameterValueCache.get(cacheKey);
  }

  const parameterValue = await getParameterValue(
    value,
    parameterTypeId,
    locale
  );

  if (parameterValue?.id) {
    parameterValueCache.set(cacheKey, parameterValue.id);
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

  parameterValueCache.set(cacheKey, parameterValueId);
  return parameterValueId;
};

async function getParameterValueLocalization(parameterValueId, targetLocale) {
  const cacheKey = `${parameterValueId}_${targetLocale}`;

  if (parameterValueLocalizationsCache.has(cacheKey)) {
    return parameterValueLocalizationsCache.get(cacheKey);
  }

  const query = `
    query GetParameterValue($id: ID!) {
      parameterValue(id: $id) {
        data {
          attributes {
            localizations {
              data {
                id
                attributes {
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
    id: parameterValueId,
  };

  try {
    const { data } = await axiosInstance.post("", { query, variables });
    const localizations =
      data.data.parameterValue.data.attributes.localizations.data;
    const targetLocalization = localizations.find(
      (loc) => loc.attributes.locale === targetLocale
    );

    const result = targetLocalization ? targetLocalization.id : null;
    parameterValueLocalizationsCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`Error getting parameter value localization:`, error);
    return null;
  }
}

export {
  getParameterValue,
  addParameterValue,
  createParameterValueLocalization,
  findOrCreateParameterValue,
  getParameterValueLocalization,
};
