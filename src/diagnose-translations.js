import "../config/config.js";
import "colors";
import axios from "axios";
import { translateText } from "../utils/translation.js";

const axiosInstance = axios.create({
  baseURL: `${process.env.STRAPI_URL}/graphql`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
  },
});

async function getSampleParameterValues(locale, limit = 20) {
  const query = `
    query GetSampleParameterValues($locale: I18NLocaleCode!, $pagination: PaginationArg) {
      parameterValues(locale: $locale, pagination: $pagination) {
        data {
          id
          attributes {
            value
            code
            parameter_type {
              data {
                id
                attributes {
                  name
                }
              }
            }
            localizations {
              data {
                id
                attributes {
                  locale
                  value
                }
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    locale,
    pagination: {
      page: 1,
      pageSize: limit,
    },
  };

  try {
    const { data } = await axiosInstance.post("", { query, variables });
    return data.data.parameterValues.data;
  } catch (error) {
    console.error(`Error fetching parameter values:`, error);
    return [];
  }
}

async function diagnoseTranslations() {
  try {
    console.log("🔍 Diagnosing parameter translation issues...".blue.bold);
    
    // Get sample Ukrainian parameter values
    const ukValues = await getSampleParameterValues("uk", 20);
    console.log(`\n📊 Found ${ukValues.length} Ukrainian parameter values`.cyan);

    let issuesFound = 0;
    let correctTranslations = 0;
    let missingTranslations = 0;

    for (const [index, ukValue] of ukValues.entries()) {
      const ukText = ukValue.attributes.value;
      const parameterType = ukValue.attributes.parameter_type.data.attributes.name;
      const ruLocalizations = ukValue.attributes.localizations.data.filter(
        loc => loc.attributes.locale === "ru"
      );

      console.log(`\n${index + 1}. Parameter: "${parameterType}"`);
      console.log(`   Ukrainian: "${ukText}"`);

      if (ruLocalizations.length === 0) {
        console.log(`   Russian: ❌ MISSING TRANSLATION`.red);
        missingTranslations++;
      } else {
        const ruText = ruLocalizations[0].attributes.value;
        console.log(`   Russian: "${ruText}"`);

        // Check if it looks like a proper translation
        if (ruText === ukText) {
          console.log(`   Status: ⚠️  SAME AS UKRAINIAN (may be correct for numbers/units)`.yellow);
        } else if (ruText.length < 3 || /^[a-zA-Z0-9\-_]+$/.test(ruText)) {
          console.log(`   Status: ❌ SUSPICIOUS - looks like random data or code`.red);
          issuesFound++;
          
          // Try to get proper translation
          try {
            console.log(`   🤖 Testing translation...`.cyan);
            const properTranslation = await translateText(ukText, "ru");
            console.log(`   ✅ Should be: "${properTranslation}"`);
          } catch (error) {
            console.log(`   ❌ Translation test failed: ${error.message}`.red);
          }
        } else {
          console.log(`   Status: ✅ LOOKS CORRECT`.green);
          correctTranslations++;
        }
      }

      // Add delay to avoid rate limiting
      if (index < ukValues.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`\n📈 DIAGNOSIS SUMMARY:`.blue.bold);
    console.log(`✅ Correct translations: ${correctTranslations}`);
    console.log(`❌ Suspicious translations: ${issuesFound}`);
    console.log(`⚠️  Missing translations: ${missingTranslations}`);
    console.log(`📊 Total checked: ${ukValues.length}`);

    if (issuesFound > 0) {
      console.log(`\n🚨 ISSUE DETECTED: Found ${issuesFound} suspicious translations that may be random data instead of proper Russian translations.`.red.bold);
      console.log(`\n💡 RECOMMENDED ACTIONS:`.yellow.bold);
      console.log(`1. Review the translation logic in sync-parameter-value.js`);
      console.log(`2. Check OpenAI API responses for errors`);
      console.log(`3. Verify the cleanString function is working correctly`);
      console.log(`4. Consider re-running the translation sync for affected parameters`);
    } else {
      console.log(`\n✅ No obvious translation issues detected in this sample.`.green.bold);
    }

  } catch (error) {
    console.error("Error during diagnosis:", error);
  }
}

diagnoseTranslations();
