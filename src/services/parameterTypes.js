import axiosInstance from "../api/axiosInstance.js";
import slugify from "slugify";
import transliterate from "transliterate";

import { parameterTypeCache } from "../../utils/cache.js";
import {
  cleanKey,
  cleanString,
  translateText,
} from "../../utils/translation.js";
import { DEFAULT_LOCALE, locales } from "../index.js";

import "../../config/config.js";

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
  const slug = slugify(transliterate(name), { lower: true, strict: true });

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

  let translatedName;

  if (cleanString(name) === "Кількість жив") {
    translatedName = "Количество жил";
  } else {
    translatedName = await translateText(name);
    translatedName = cleanKey(translatedName);
  }

  if (translatedName === "Количество живых") {
    translatedName = "Количество жил";
  }

  const variables = {
    id: parameterTypeId,
    locale: finalLocale,
    data: {
      name: translatedName,
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
  const cacheKey = `${name}_${locale}`;

  if (parameterTypeCache.has(cacheKey)) {
    return parameterTypeCache.get(cacheKey);
  }
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
    parameterTypeCache.set(cacheKey, parameterType.id);
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

  parameterTypeCache.set(cacheKey, parameterTypeId);
  return parameterTypeId;
};

export {
  getParameterType,
  addParameterType,
  getParameterTypeById,
  createParameterTypeLocalization,
  findOrCreateParameterType,
};
